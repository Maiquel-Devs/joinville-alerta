import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cache_store
import trajetos
from config import FAIXAS
from trajetos import AREA_SEM_FAIXA_ATIVA as AREA
from trajetos import FAIXA_ATIVA as ATIVA
from trajetos import NAO_AVALIADO as NAO
from trajetos import classificar_trecho

# (faixas do trecho, faixas ativas, classe esperada)
TABELA = [
    ([], [], NAO),                                          # fora das áreas mapeadas
    ([], ["mare_1_6"], NAO),                                # fora da área: faixa ativa não muda nada
    ([], ["mare_1_6", "pluvial_vn_tr25"], NAO),
    (["mare_1_6"], [], AREA),                               # mapeado, nada ativo
    (["mare_1_6"], ["mare_1_6"], ATIVA),
    (["mare_1_6"], ["mare_2_5"], AREA),                     # outra faixa ativa
    (["pluvial_vn_tr5"], ["pluvial_vn_tr5", "pluvial_vn_tr10"], ATIVA),
    (["pluvial_vn_tr10"], ["pluvial_vn_tr5"], AREA),
    (["mare_1_6", "mare_2_5"], ["mare_2_5"], ATIVA),        # mais de uma faixa: basta uma ativa
    (["mare_1_6", "mare_2_5"], ["mare_1_6", "mare_2_5"], ATIVA),
    (["mare_1_6", "mare_2_5"], [], AREA),
    (["mare_1_6", "mare_2_5"], ["pluvial_vn_tr25"], AREA),  # nenhuma das duas ativa
    (("mare_1_6",), frozenset({"mare_1_6"}), ATIVA),        # aceita tupla e conjunto
]


@pytest.mark.parametrize("faixas, ativas, esperado", TABELA)
def test_classificar_trecho(faixas, ativas, esperado):
    assert classificar_trecho(faixas, ativas) == esperado


def test_nao_avaliado_nunca_vira_outra_classe():
    for ativas in ([], list(FAIXAS)):
        assert classificar_trecho([], ativas) == NAO


# --- montar_trajeto e endpoints, com um trajeto de teste -----------------------------

def _feat(faixas, m):
    return {"type": "Feature", "properties": {"faixas": faixas, "m": m},
            "geometry": {"type": "LineString", "coordinates": [[-48.85, -26.30], [-48.84, -26.30]]}}


@pytest.fixture
def dados_fake(tmp_path, monkeypatch):
    indice = [{"id": "teste", "nome": "Teste", "origem": {"nome": "A", "lat": -26.3, "lon": -48.85},
               "destino": {"nome": "B", "lat": -26.3, "lon": -48.84}}]
    (tmp_path / "indice.json").write_text(json.dumps(indice), encoding="utf-8")
    colecao = {"type": "FeatureCollection", "features": [
        _feat(["mare_1_6"], 1000), _feat(["mare_1_6", "pluvial_vn_tr5"], 500),
        _feat(["pluvial_vn_tr10"], 250), _feat([], 2000)]}
    (tmp_path / "teste.geojson").write_text(json.dumps(colecao), encoding="utf-8")
    monkeypatch.setattr(trajetos, "DIR_TRAJETOS", tmp_path)
    trajetos.indice.cache_clear()
    trajetos._geojson.cache_clear()
    yield
    trajetos.indice.cache_clear()
    trajetos._geojson.cache_clear()


def _status(**ativas):
    faixas = {f: "inativa" for f in FAIXAS}
    faixas.update({f: "ativa" for f, v in ativas.items() if v})
    return {"status": "ok", "gerado_em": "2026-11-06T10:00:00-03:00", "faixas": faixas}


def test_montar_trajeto_totais(dados_fake):
    t = trajetos.trajeto_por_id("teste")
    r = trajetos.montar_trajeto(t, _status(mare_1_6=True))
    assert r["status"] == "ok" and r["gerado_em"] == "2026-11-06T10:00:00-03:00"
    assert [f["properties"]["classe"] for f in r["trechos"]["features"]] == [ATIVA, ATIVA, AREA, NAO]
    assert r["totais_km"] == {ATIVA: 1.5, AREA: 0.25, NAO: 2.0}
    assert r["total_km"] == 3.75 and sum(r["totais_km"].values()) == r["total_km"]


def test_montar_trajeto_seco_mantem_nao_avaliado_separado(dados_fake):
    r = trajetos.montar_trajeto(trajetos.trajeto_por_id("teste"), _status())
    assert r["totais_km"] == {ATIVA: 0.0, AREA: 1.75, NAO: 2.0}


@pytest.mark.parametrize("status", [
    {"status": "indisponivel", "gerado_em": None, "faixas": {}},
    {"status": "ok", "gerado_em": "x", "faixas": {**{f: "inativa" for f in FAIXAS}, "mare_1_6": "indisponivel"}},
])
def test_montar_trajeto_sem_dado_valido_nao_classifica(dados_fake, status):
    r = trajetos.montar_trajeto(trajetos.trajeto_por_id("teste"), status)
    assert r["status"] == "indisponivel" and r["trechos"] is None and r["totais_km"] is None


def _cliente(monkeypatch):
    import asyncio

    from fastapi.testclient import TestClient

    import main

    async def coleta_travada():
        await asyncio.sleep(3600)

    monkeypatch.setattr(main, "update_telemetry_job", coleta_travada)
    return TestClient(main.app)


def test_endpoints(dados_fake, monkeypatch):
    pytest.importorskip("httpx")
    monkeypatch.setattr(cache_store, "_ultimo", None)
    with _cliente(monkeypatch) as c:
        lista = c.get("/api/v1/trajetos")
        assert lista.status_code == 200 and [t["id"] for t in lista.json()] == ["teste"]

        vazio = c.get("/api/v1/trajetos/teste").json()          # cache vazio
        assert vazio["status"] == "indisponivel" and vazio["trechos"] is None

        monkeypatch.setattr(cache_store, "_ultimo", _status(mare_1_6=True))
        ok = c.get("/api/v1/trajetos/teste").json()
        assert ok["status"] == "ok" and ok["totais_km"][ATIVA] == 1.5

        assert c.get("/api/v1/trajetos/inexistente").status_code == 404
        assert c.get("/api/v1/trajetos/..%2Findice").status_code == 404


# --- arquivos reais gerados por scripts/gerar_trajetos.py ----------------------------

def test_arquivos_reais_batem_com_o_indice():
    raiz = Path(__file__).resolve().parents[2] / "data" / "trajetos"
    for t in json.loads((raiz / "indice.json").read_text(encoding="utf-8")):
        arq = raiz / f"{t['id']}.geojson"
        assert arq.stat().st_size <= 100 * 1024
        for f in json.loads(arq.read_text(encoding="utf-8"))["features"]:
            assert set(f["properties"]) == {"faixas", "m"} and f["geometry"]["type"] == "LineString"
            assert set(f["properties"]["faixas"]) <= set(FAIXAS)
