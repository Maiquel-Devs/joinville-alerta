import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cache_store
import rota_exposicao as rx
from config import FAIXAS
from rota_exposicao import Rede, TextoCurto, calcular, classe_da_aresta, consulta, resolver

ATIVA, AREA, NAO = rx.FAIXA_ATIVA, rx.AREA_SEM_FAIXA_ATIVA, rx.NAO_AVALIADO


# --- grafo sintético -------------------------------------------------------------------------------
# A -(500)- B -(500)- E   curto: 1000 m, tudo em faixa mare_1_6
# A -(400)- C -(400)- D -(400)- E   longo: 1200 m, sem faixa (não avaliado)
#                                   F: nó isolado

def _nos():
    return [[1, -26.300, -48.850], [2, -26.300, -48.845], [5, -26.300, -48.840],  # A, B, E
            [3, -26.295, -48.850], [4, -26.295, -48.840],  # C, D
            [6, -26.350, -48.800]]  # F


def _arestas(de=400, faixas_curto=("mare_1_6",)):
    def par(u, v, m, nome, faixas, osmid):
        return [[u, v, m, [osmid], [nome], list(faixas)], [v, u, m, [osmid], [nome], list(faixas)]]

    return (par(1, 2, 500, "Rua Curta", faixas_curto, 10) + par(2, 5, 500, "Rua Curta", faixas_curto, 11)
            + par(1, 3, 400, "Rua Longa", (), 20) + par(3, 4, 400, "Rua Longa", (), 21) + par(4, 5, de, "Rua Longa", (), 22))


@pytest.fixture
def rede():
    return Rede(_nos(), _arestas())


# --- classe da aresta ------------------------------------------------------------------------------

def test_classe_da_aresta():
    assert classe_da_aresta({"faixas": ["mare_1_6"]}, ["mare_1_6"]) == ATIVA
    assert classe_da_aresta({"faixas": ["mare_1_6", "mare_2_5"]}, ["mare_2_5"]) == ATIVA
    assert classe_da_aresta({"faixas": ["mare_1_6"]}, []) == AREA  # tem faixa, nenhuma ativa
    assert classe_da_aresta({"faixas": ["mare_1_6"]}, ["mare_2_5"]) == AREA
    assert classe_da_aresta({"faixas": []}, ["mare_1_6"]) == NAO  # fora das áreas mapeadas
    assert classe_da_aresta({"faixas": []}, []) == NAO


def test_expo_por_classe():
    assert (rx.EXPO[ATIVA], rx.EXPO[AREA], rx.EXPO[NAO]) == (1.0, 0.5, 0.0)
    assert rx.expo({"faixas": ["mare_1_6"]}, ["mare_1_6"]) == 1.0
    assert rx.expo({"faixas": ["mare_1_6"]}, []) == 0.5
    assert rx.expo({"faixas": []}, ["mare_1_6"]) == 0.0


# --- caminhos --------------------------------------------------------------------------------------

def test_k0_devolve_o_mais_curto(rede):
    r = calcular(rede, 1, 5, ["mare_1_6"], K=0)
    assert r["status"] == "ok" and r["teto_aplicado"] is False
    assert r["caminho_curto"]["km"] == 1.0 and r["caminho_exposicao"]["km"] == 1.0
    assert r["diferenca_km"] == 0.0
    assert r["caminho_exposicao"]["km_por_classe"] == {ATIVA: 1.0, AREA: 0.0, NAO: 0.0}


def test_k3_prefere_o_longo_sem_classificacao_dentro_do_teto(rede):
    r = calcular(rede, 1, 5, ["mare_1_6"])  # K = 3 e teto 20% por padrão; o longo tem 1200 m = +20%
    assert r["status"] == "ok" and r["teto_aplicado"] is False
    assert r["caminho_curto"]["km"] == 1.0
    assert r["caminho_curto"]["km_por_classe"] == {ATIVA: 1.0, AREA: 0.0, NAO: 0.0}
    assert r["caminho_exposicao"]["km"] == 1.2
    assert r["caminho_exposicao"]["km_por_classe"] == {ATIVA: 0.0, AREA: 0.0, NAO: 1.2}
    assert r["diferenca_km"] == 0.2
    assert (r["k"], r["teto"]) == (3.0, 0.20)


def test_area_sem_faixa_ativa_pesa_metade(rede):
    # sem faixa ativa o curto é "área mapeada": peso 1000 * (1 + 3 * 0,5) = 2500 > 1200 do longo
    r = calcular(rede, 1, 5, [])
    assert r["caminho_curto"]["km_por_classe"] == {ATIVA: 0.0, AREA: 1.0, NAO: 0.0}
    assert r["caminho_exposicao"]["km"] == 1.2
    # com K = 1 o curto custa 1500 e o longo 1200: ainda vence o longo; com K = 0,3 o curto (1150) vence
    assert calcular(rede, 1, 5, [], K=0.3)["caminho_exposicao"]["km"] == 1.0


def test_acima_do_teto_devolve_o_curto_e_marca(rede):
    longo = Rede(_nos(), _arestas(de=600))  # longo = 1400 m, +40%
    r = calcular(longo, 1, 5, ["mare_1_6"])
    assert r["teto_aplicado"] is True
    assert r["caminho_exposicao"] == r["caminho_curto"]
    assert r["caminho_exposicao"]["km"] == 1.0 and r["diferenca_km"] == 0.0
    # teto maior: o desvio passa
    livre = calcular(longo, 1, 5, ["mare_1_6"], teto=0.5)
    assert livre["teto_aplicado"] is False and livre["caminho_exposicao"]["km"] == 1.4


def test_nos_desconectados_ou_inexistentes_dao_sem_caminho(rede):
    assert calcular(rede, 1, 6, ["mare_1_6"]) == {"status": "sem_caminho"}  # F está isolado
    assert calcular(rede, 1, 99, ["mare_1_6"]) == {"status": "sem_caminho"}


def test_trechos_do_caminho_no_formato_dos_trajetos(rede):
    r = calcular(rede, 1, 5, ["mare_1_6"], K=0)
    feats = r["caminho_curto"]["trechos"]["features"]
    assert len(feats) == 1  # as duas arestas têm a mesma classe e o mesmo nome: viram um trecho
    p = feats[0]["properties"]
    assert p == {"classe": ATIVA, "m": 1000, "nomes": ["Rua Curta"], "osmid": [10, 11]}
    assert feats[0]["geometry"]["type"] == "LineString" and len(feats[0]["geometry"]["coordinates"]) == 3
    soma = sum(f["properties"]["m"] for f in r["caminho_exposicao"]["trechos"]["features"])
    assert soma == round(r["caminho_exposicao"]["km"] * 1000)


def test_metros_inteiros_somam_o_total_exato():
    assert sum(rx._metros_inteiros([10.4, 10.4, 10.4, 10.4, 10.4])) == 52
    assert sum(rx._metros_inteiros([28.49, 28.49, 28.49])) == 85


# --- normalização e casamento (iguais aos do front) ----------------------------------------------

def test_normalizacao_e_consulta():
    assert rx.normalizar("Rua do Príncipe") == "rua do principe"
    assert rx.normalizar("  Doutor   João-Colin ") == "doutor joao colin"
    assert consulta("Rua") is None and consulta("rua ") is None and consulta("Av") is None
    assert consulta("ru") is None and consulta("") is None and consulta(None) is None
    assert consulta("Rua do Príncipe") == "do principe"
    assert consulta("principe") == "principe"


def _vias():
    nos = [[1, -26.300, -48.850], [2, -26.300, -48.846],  # Rua do Príncipe
           [3, -26.310, -48.850], [4, -26.310, -48.846],  # Rua Doutor João Colin
           [5, -26.280, -48.850], [6, -26.280, -48.847],  # Rua Padre Antônio Vieira (perto de 5-6: 300 m)
           [7, -26.280, -48.844],
           [8, -26.330, -48.800], [9, -26.330, -48.797],  # outra Rua Padre Antônio Vieira, a km dali
           [10, -26.320, -48.820], [11, -26.320, -48.817]]  # Aubé / Albano Schmidt

    def par(u, v, nomes, osmid):
        return [[u, v, 300.0, [osmid], nomes, []], [v, u, 300.0, [osmid], nomes, []]]

    arestas = (par(1, 2, ["Rua do Príncipe"], 1) + par(3, 4, ["Rua Doutor João Colin"], 2)
               + par(5, 6, ["Rua Padre Antônio Vieira"], 3) + par(6, 7, ["Rua Padre Antônio Vieira"], 4)
               + par(8, 9, ["Rua Padre Antônio Vieira"], 5) + par(10, 11, ["Rua Aubé", "Rua Albano Schmidt"], 6))
    return Rede(nos, arestas)


def test_rua_sozinha_nao_casa():
    for texto in ("Rua", "rua ", "Avenida", "ru", ""):
        with pytest.raises(TextoCurto):
            resolver(_vias(), texto)


def test_resolver_casa_sem_denominacao_e_por_palavra():
    r = resolver(_vias(), "principe")
    assert r["ambiguo"] is False and [o["nome"] for o in r["opcoes"]] == ["Rua do Príncipe"]
    assert [o["nome"] for o in resolver(_vias(), "joao colin")["opcoes"]] == ["Rua Doutor João Colin"]
    assert [o["nome"] for o in resolver(_vias(), "RUA DOUTOR JOÃO")["opcoes"]] == ["Rua Doutor João Colin"]
    assert resolver(_vias(), "Rua XV de Novembro") == {"ambiguo": False, "total_opcoes": 0, "opcoes": []}


def test_lista_de_nomes_usa_o_primeiro_nome_que_casou():
    assert [o["nome"] for o in resolver(_vias(), "albano")["opcoes"]] == ["Rua Albano Schmidt"]
    assert [o["nome"] for o in resolver(_vias(), "aube")["opcoes"]] == ["Rua Aubé"]


def test_nome_ambiguo_devolve_opcoes_sem_escolher():
    r = resolver(_vias(), "padre antonio")
    assert r["ambiguo"] is True and r["total_opcoes"] == 2
    primeiro, segundo = r["opcoes"]
    assert primeiro["nome"] == segundo["nome"] == "Rua Padre Antônio Vieira"
    assert primeiro["trechos"] == 2 and segundo["trechos"] == 1  # o trecho de 300 m + 300 m é uma rua só
    assert primeiro["rotulo"] == "Rua Padre Antônio Vieira (2 trechos)"
    for o in r["opcoes"]:
        assert set(o) == {"nome", "rotulo", "trechos", "no", "lat", "lon"}
    assert primeiro["no"] == 6  # o nó do meio da rua com os nós 5, 6 e 7


# --- estado atual ----------------------------------------------------------------------------------

AGORA = datetime(2026, 11, 7, 12, 0, tzinfo=timezone(timedelta(hours=-3)))


def _status(minutos=10, **ativas):
    faixas = {f: "inativa" for f in FAIXAS}
    faixas.update({f: "ativa" for f, v in ativas.items() if v})
    return {"status": "ok", "gerado_em": (AGORA - timedelta(minutes=minutos)).isoformat(), "faixas": faixas}


def test_faixas_ativas_validas():
    assert rx.faixas_ativas_validas(_status(mare_1_6=True), AGORA) == ("mare_1_6",)
    assert rx.faixas_ativas_validas(_status(120), AGORA) == ()  # no limite: ainda vale
    assert rx.faixas_ativas_validas(_status(121), AGORA) is None  # vencido
    assert rx.faixas_ativas_validas({"status": "indisponivel", "faixas": {}}, AGORA) is None
    sem_dado = _status()
    sem_dado["faixas"]["mare_1_6"] = "indisponivel"
    assert rx.faixas_ativas_validas(sem_dado, AGORA) is None
    assert rx.faixas_ativas_validas({**_status(), "gerado_em": None}, AGORA) is None


# --- endpoint --------------------------------------------------------------------------------------

def _cliente(monkeypatch, rede_):
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    import main

    async def coleta_travada():
        await asyncio.sleep(3600)

    monkeypatch.setattr(main, "update_telemetry_job", coleta_travada)
    monkeypatch.setattr(rx, "_rede", rede_)
    monkeypatch.setattr(main, "agora", lambda: AGORA)
    return TestClient(main.app)


def test_endpoint_texto_curto_devolve_400(monkeypatch):
    with _cliente(monkeypatch, _vias()) as c:
        r = c.get("/api/v1/rota", params={"origem": "Rua", "destino": "Rua do Príncipe"})
        assert r.status_code == 400 and r.json()["detail"] == {"campo": "origem", "motivo": "curto"}
        r = c.get("/api/v1/rota", params={"origem": "principe", "destino": "ab"})
        assert r.status_code == 400 and r.json()["detail"]["campo"] == "destino"


def test_endpoint_ambiguo_nao_calcula(monkeypatch):
    with _cliente(monkeypatch, _vias()) as c:
        monkeypatch.setattr(cache_store, "_ultimo", _status(mare_1_6=True))
        r = c.get("/api/v1/rota", params={"origem": "padre antonio", "destino": "principe"}).json()
        assert r["status"] == "ambiguo"
        assert r["origem"]["ambiguo"] is True and len(r["origem"]["opcoes"]) == 2
        assert r["destino"]["ambiguo"] is False
        assert "caminho_curto" not in r and "caminho_exposicao" not in r


def test_endpoint_ok_com_os_dois_caminhos(monkeypatch):
    # Rua Origem passa pelos nós 7, 1 e 9 (o 1 fica no meio); Rua Destino, pelos nós 8, 5 e 10 (o 5 no meio)
    nos = _nos() + [[7, -26.300, -48.8509], [9, -26.300, -48.8491], [8, -26.300, -48.8409], [10, -26.300, -48.8391]]
    extra = []
    for u, v, nome, osmid in ((7, 1, "Rua Origem", 40), (1, 9, "Rua Origem", 41), (8, 5, "Rua Destino", 42), (5, 10, "Rua Destino", 43)):
        extra += [[u, v, 1.0, [osmid], [nome], []], [v, u, 1.0, [osmid], [nome], []]]
    rede_ = Rede(nos, _arestas() + extra)
    with _cliente(monkeypatch, rede_) as c:
        monkeypatch.setattr(cache_store, "_ultimo", _status(mare_1_6=True))
        r = c.get("/api/v1/rota", params={"origem": "Rua Origem", "destino": "Rua Destino"}).json()
        assert r["status"] == "ok" and r["teto_aplicado"] is False
        assert (r["origem"]["nome"], r["origem"]["no"]) == ("Rua Origem", 1)
        assert (r["destino"]["nome"], r["destino"]["no"]) == ("Rua Destino", 5)
        assert r["caminho_curto"]["km_por_classe"][ATIVA] == 1.0
        assert r["caminho_exposicao"]["km_por_classe"][ATIVA] == 0.0
        assert r["diferenca_km"] == 0.2 and r["faixas_ativas"] == ["mare_1_6"]
        assert r["gerado_em"] == _status(mare_1_6=True)["gerado_em"]


def test_endpoint_nao_encontrado_nao_calcula(monkeypatch):
    with _cliente(monkeypatch, Rede(_nos(), _arestas())) as c:
        monkeypatch.setattr(cache_store, "_ultimo", _status(mare_1_6=True))
        for params, lado_vazio in (({"origem": "Rua Inexistente", "destino": "Rua Curta"}, "origem"),
                                   ({"origem": "Rua Curta", "destino": "Rua Inexistente"}, "destino")):
            r = c.get("/api/v1/rota", params=params)
            assert r.status_code == 200
            corpo = r.json()
            assert corpo["status"] == "nao_encontrado"
            assert corpo[lado_vazio]["total_opcoes"] == 0 and corpo[lado_vazio]["opcoes"] == []
            assert "caminho_curto" not in corpo and "caminho_exposicao" not in corpo


def test_endpoint_indisponivel_ou_vencido_nao_calcula(monkeypatch):
    with _cliente(monkeypatch, _vias()) as c:
        for estado in ({"status": "indisponivel", "gerado_em": None, "faixas": {}}, _status(121)):
            monkeypatch.setattr(cache_store, "_ultimo", estado if estado["faixas"] else None)
            r = c.get("/api/v1/rota", params={"origem": "principe", "destino": "joao colin"}).json()
            assert r["status"] == "indisponivel" and "caminho_curto" not in r


def test_endpoint_escolha_do_no_e_sem_caminho(monkeypatch):
    with _cliente(monkeypatch, Rede(_nos(), _arestas())) as c:
        monkeypatch.setattr(cache_store, "_ultimo", _status(mare_1_6=True))
        r = c.get("/api/v1/rota", params={"origem": "Rua Curta", "destino": "Rua Curta", "origem_no": 1, "destino_no": 6})
        assert r.status_code == 200 and r.json()["status"] == "sem_caminho"
        r = c.get("/api/v1/rota", params={"origem": "Rua Curta", "destino": "Rua Curta", "origem_no": 1, "destino_no": 999})
        assert r.status_code == 400 and r.json()["detail"]["motivo"] == "no_inexistente"
