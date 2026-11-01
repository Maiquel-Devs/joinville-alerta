import itertools
import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cache_store
import textos
from config import FAIXAS, NIVEIS
from risk_engine import avaliar_atencao_geral, avaliar_faixas, faixas_ativas, nivel_global
from scheduler import montar_resultado
from sources import TZ, escolher_mare, somar_chuva
from textos import PROIBIDAS

A, I, X = "ativa", "inativa", "indisponivel"

# (maré m acima do NMM, chuva 24h mm, mare_1_6, mare_2_5, tr5, tr10, tr25, aviso chuva, nível)
# Chuva: aviso geral em 53 mm (não pinta rua); faixas de rua em 98 / 110 / 125 mm.
TABELA = [
    (0.50, 0.0, I, I, I, I, I, False, "nenhum"),
    (1.30, 25.0, I, I, I, I, I, False, "nenhum"),         # caso que a v1 contradizia
    (1.59, 0.0, I, I, I, I, I, False, "nenhum"),          # logo abaixo de 1,6
    (1.60, 0.0, A, I, I, I, I, False, "atencao"),         # limite de 1,6
    (2.52, 0.0, A, I, I, I, I, False, "atencao"),         # logo abaixo de 2,53
    (2.53, 0.0, A, A, I, I, I, False, "alto"),            # limite de 2,5
    (0.50, 52.9, I, I, I, I, I, False, "nenhum"),
    (0.50, 53.0, I, I, I, I, I, True, "atencao_geral"),   # limite do aviso geral: ruas neutras
    (0.50, 97.0, I, I, I, I, I, True, "atencao_geral"),
    (0.50, 98.0, I, I, A, I, I, True, "atencao"),         # limite de TR 5
    (0.50, 109.0, I, I, A, I, I, True, "atencao"),
    (0.50, 110.0, I, I, A, A, I, True, "atencao"),        # limite de TR 10 (implica TR 5)
    (0.50, 124.0, I, I, A, A, I, True, "atencao"),
    (0.50, 125.0, I, I, A, A, A, True, "alto"),           # limite de TR 25 (implica TR 10 e 5)
    (1.60, 40.0, A, I, I, I, I, False, "atencao"),        # maré pinta a rua; chuva abaixo do aviso
    (1.60, 60.0, A, I, I, I, I, True, "atencao"),         # maré pinta a rua + aviso geral
    (2.60, 60.0, A, A, I, I, I, True, "alto"),            # pior faixa de rua vence
    (1.60, 110.0, A, I, A, A, I, True, "atencao"),        # maré e chuva juntas
    (2.53, 125.0, A, A, A, A, A, True, "alto"),
    (None, 0.0, X, X, I, I, I, False, "indisponivel"),    # sem maré: nunca "nenhum"
    (0.50, None, I, I, X, X, X, None, "indisponivel"),    # sem chuva: nunca "nenhum"
    (None, None, X, X, X, X, X, None, "indisponivel"),
    (1.70, None, A, I, X, X, X, None, "atencao"),         # ativa vale mesmo com dado faltando
    (None, 60.0, X, X, I, I, I, True, "atencao_geral"),   # aviso de chuva não some se a maré falta
    (None, 98.0, X, X, A, I, I, True, "atencao"),         # faixa de chuva ativa vale sem maré
]


@pytest.mark.parametrize("mare,chuva,m16,m25,tr5,tr10,tr25,aviso,nivel", TABELA)
def test_tabela_de_risco(mare, chuva, m16, m25, tr5, tr10, tr25, aviso, nivel):
    f = avaliar_faixas(mare, chuva)
    assert f == {"mare_1_6": m16, "mare_2_5": m25, "pluvial_vn_tr5": tr5, "pluvial_vn_tr10": tr10, "pluvial_vn_tr25": tr25}
    ag = avaliar_atencao_geral(chuva)
    assert ag["chuva"] is aviso
    assert ag["mare"] is None  # maré sem gatilho de aviso até a tarefa 6.5
    assert nivel_global(f, ag) == nivel


@pytest.mark.parametrize("chuva", [0.0, 52.9, 53.0, 97.0, 98.0, 109.9, 110.0, 124.9, 125.0, 300.0])
def test_tr_maior_implica_tr_menor(chuva):
    f = avaliar_faixas(0.0, chuva)
    if f["pluvial_vn_tr25"] == A:
        assert f["pluvial_vn_tr10"] == A
    if f["pluvial_vn_tr10"] == A:
        assert f["pluvial_vn_tr5"] == A


def test_faixas_do_contrato_sem_itaum():
    assert FAIXAS == ("mare_1_6", "mare_2_5", "pluvial_vn_tr5", "pluvial_vn_tr10", "pluvial_vn_tr25")
    assert NIVEIS == ("nenhum", "atencao_geral", "atencao", "alto")


# --- maré (CIRAM) -----------------------------------------------------------

def _linha(rotulo, obs, prev, nmm="103.1"):
    f = lambda v: {"v": v, "f": None}
    return {"c": [f(rotulo), f(obs), f("  156.00"), f("    0.00"), f(prev), f("null"), f(nmm)]}


REF = datetime(2026, 10, 8, 14, 20, tzinfo=TZ)


def test_mare_medida_usa_nmm_da_propria_linha():
    payload = {"rows": [_linha("08/10 14:15", "  187.80", "null")]}
    r = escolher_mare(payload, REF)
    assert r["mare_efetiva_m"] == 0.85  # (187,8 - 103,1) / 100
    assert r["mare_origem"] == "medida"


def test_mare_na_regua_nao_e_gatilho():
    # 160 cm na régua é só 0,57 m acima do NMM: não ativa mare_1_6
    r = escolher_mare({"rows": [_linha("08/10 14:15", "160.00", "null")]}, REF)
    assert r["mare_efetiva_m"] == 0.57
    assert avaliar_faixas(r["mare_efetiva_m"], 0.0)["mare_1_6"] == I


def test_mare_sem_medida_recente_cai_para_previsao_rotulada():
    payload = {"rows": [_linha("08/10 11:00", "187.80", "null"), _linha("08/10 14:00", "null", "170.00")]}
    r = escolher_mare(payload, REF)
    assert r["mare_origem"] == "estimativa"
    assert r["mare_efetiva_m"] == 0.67


def test_mare_sem_dado_valido_e_none():
    payload = {"rows": [_linha("08/10 08:00", "187.80", "null"), _linha("08/10 14:15", "null", "null")]}
    assert escolher_mare(payload, REF) is None


def test_mare_virada_de_ano():
    ref = datetime(2026, 12, 31, 23, 50, tzinfo=TZ)
    r = escolher_mare({"rows": [_linha("31/12 23:45", "200.00", "null")]}, ref)
    assert r["mare_efetiva_m"] == 0.97


# --- chuva (Open-Meteo) -----------------------------------------------------

def _horas(n):
    return [f"2026-10-{1 + i // 24:02d}T{i % 24:02d}:00" for i in range(n)]


def test_chuva_janela_ignora_horas_futuras():
    horas = _horas(72)
    chuva = [1.0] * 72
    chuva[60] = 50.0  # hora futura em relação à atual (índice 49)
    r = somar_chuva(horas, chuva, horas[49])
    assert r == {"chuva_24h_mm": 24.0, "chuva_48h_mm": 48.0}


def test_chuva_lacuna_nao_vira_zero():
    horas = _horas(72)
    chuva = [1.0] * 72
    chuva[40] = None
    r = somar_chuva(horas, chuva, horas[49])
    assert r["chuva_24h_mm"] is None and r["chuva_48h_mm"] is None


# --- resultado, cache e texto -------------------------------------------------

def test_cache_vazio_responde_indisponivel(monkeypatch):
    monkeypatch.setattr(cache_store, "_ultimo", None)
    s = cache_store.status_geral()
    assert s["status"] == "indisponivel" and s["nivel"] == "indisponivel" and s["texto"] is None
    assert s["atencao_geral"] == {"chuva": None, "mare": None}


def test_resultado_sem_nenhum_dado_e_indisponivel():
    r = montar_resultado(None, {"chuva_24h_mm": None, "chuva_48h_mm": None}, REF)
    assert r["status"] == "indisponivel" and r["nivel"] == "indisponivel"


def test_resultado_chuva_forte_nao_pinta_rua():
    mare = {"mare_efetiva_m": 0.5, "mare_origem": "medida", "mare_referencia_em": "x"}
    r = montar_resultado(mare, {"chuva_24h_mm": 60.0, "chuva_48h_mm": 70.0}, REF)
    assert r["nivel"] == "atencao_geral" and r["atencao_geral"]["chuva"] is True
    assert faixas_ativas(r["faixas"]) == ()
    t = textos.texto(r["nivel"], faixas_ativas(r["faixas"]), r["atencao_geral"])
    assert "Chuva forte acumulada" in t["mensagem"] and "199" in t["mensagem"]


def test_resultado_contrato():
    mare = {"mare_efetiva_m": 1.7, "mare_origem": "medida", "mare_referencia_em": "x"}
    r = montar_resultado(mare, {"chuva_24h_mm": 5.0, "chuva_48h_mm": 9.0}, REF)
    assert r["status"] == "ok" and r["nivel"] == "atencao"
    assert {"gerado_em", "validade_min", "mare_efetiva_m", "chuva_24h_mm", "faixas", "atencao_geral", "nivel", "texto"} <= r.keys()
    assert set(r["faixas"]) == set(FAIXAS) and set(r["atencao_geral"]) == {"chuva", "mare"}
    assert r["nivel"] in NIVEIS


def test_resultado_chuva_de_rua_pinta_vila_nova():
    mare = {"mare_efetiva_m": 0.5, "mare_origem": "medida", "mare_referencia_em": "x"}
    r = montar_resultado(mare, {"chuva_24h_mm": 112.0, "chuva_48h_mm": 130.0}, REF)
    assert faixas_ativas(r["faixas"]) == ("pluvial_vn_tr5", "pluvial_vn_tr10")
    assert r["nivel"] == "atencao"


COMBINACOES = [
    (nivel, ativas)
    for nivel in (*NIVEIS, "indisponivel")
    for n in range(len(FAIXAS) + 1)
    for ativas in itertools.combinations(FAIXAS, n)
]


@pytest.mark.parametrize("nivel,ativas", COMBINACOES)
def test_texto_respeita_linguagem_em_todas_as_combinacoes(nivel, ativas):
    t = textos.texto(nivel, ativas)
    junto = f"{t['titulo']} {t['mensagem']}".lower()
    assert t["titulo"] and t["mensagem"]
    assert not any(p in junto for p in PROIBIDAS)
    assert "199" in junto
    assert "normal" not in junto and "sem risco" not in junto


def test_texto_chuva_aninhada_cita_so_o_maior_tr():
    t = textos.texto("alto", ("pluvial_vn_tr5", "pluvial_vn_tr10", "pluvial_vn_tr25"))
    assert "25 anos" in t["mensagem"] and "5 anos" not in t["mensagem"].replace("25 anos", "")


def test_texto_atencao_geral_nao_vira_faixa_ativa():
    t = textos.texto("nenhum", (), {"chuva": True, "mare": None})
    assert "Nenhuma faixa ativa agora" == t["titulo"]
    assert "199" in t["mensagem"]


def test_texto_indisponivel_nao_diz_que_esta_tudo_bem():
    t = textos.texto("indisponivel", ())
    assert "não significa que não haja risco" in t["mensagem"]


def test_texto_usa_areas_mapeadas_pelo_pddu():
    t = textos.texto("nenhum", ())
    assert "Fora das áreas mapeadas pelo PDDU também pode alagar" in t["mensagem"]


# --- partida não bloqueante -----------------------------------------------------

def test_app_responde_com_coleta_inicial_travada(monkeypatch):
    import asyncio

    from fastapi.testclient import TestClient

    import main

    async def coleta_travada():
        await asyncio.sleep(3600)

    monkeypatch.setattr(main, "update_telemetry_job", coleta_travada)
    monkeypatch.setattr(cache_store, "_ultimo", None)
    with TestClient(main.app) as client:  # o lifespan não pode esperar a coleta
        r = client.get("/api/v1/status-geral")
    assert r.status_code == 200
    assert r.json()["status"] == "indisponivel" and r.json()["nivel"] == "indisponivel"


def test_cors_restrito_a_origem_do_front():
    """5.9: só a origem do GitHub Pages recebe CORS, e sem credenciais."""
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    import main

    cliente = TestClient(main.app)
    ok = cliente.get("/api/v1/status-geral", headers={"Origin": "https://maiquel-devs.github.io"})
    assert ok.headers.get("access-control-allow-origin") == "https://maiquel-devs.github.io"
    assert "access-control-allow-credentials" not in ok.headers
    outra = cliente.get("/api/v1/status-geral", headers={"Origin": "https://exemplo.com"})
    assert "access-control-allow-origin" not in outra.headers
