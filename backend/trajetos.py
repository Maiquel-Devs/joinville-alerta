# backend/trajetos.py
# Mapa de trajetos fixos (Etapa 10). O back-end é a única fonte da classe de cada trecho:
# o front só desenha. Métrica de EXPOSIÇÃO às faixas do PDDU; nunca sugere caminho nem desvio.
# Os trajetos vêm de data/trajetos/ (gerados por scripts/gerar_trajetos.py).
import json
import os
from functools import lru_cache
from pathlib import Path

from risk_engine import INDISPONIVEL, faixas_ativas

FAIXA_ATIVA = "faixa_ativa"
AREA_SEM_FAIXA_ATIVA = "area_sem_faixa_ativa"
NAO_AVALIADO = "nao_avaliado"
CLASSES = (FAIXA_ATIVA, AREA_SEM_FAIXA_ATIVA, NAO_AVALIADO)

# Calculado a partir deste arquivo (nunca do diretório de trabalho): <repo>/data/trajetos.
# TRAJETOS_DIR é uma sobrescrita opcional (ex.: se o deploy não levar a pasta data/ junto).
DIR_PADRAO = Path(__file__).resolve().parent.parent / "data" / "trajetos"
DIR_TRAJETOS = Path(os.getenv("TRAJETOS_DIR") or DIR_PADRAO)


def classificar_trecho(faixas_do_trecho, faixas_ativas) -> str:
    """Classe de um trecho. Sem faixas = fora das áreas mapeadas = não avaliado (nunca "zero")."""
    faixas = set(faixas_do_trecho)
    if not faixas:
        return NAO_AVALIADO
    return FAIXA_ATIVA if faixas & set(faixas_ativas) else AREA_SEM_FAIXA_ATIVA


@lru_cache(maxsize=1)
def indice() -> list[dict]:
    return json.loads((DIR_TRAJETOS / "indice.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _geojson(id_: str) -> dict:
    return json.loads((DIR_TRAJETOS / f"{id_}.geojson").read_text(encoding="utf-8"))


def trajeto_por_id(id_: str) -> dict | None:
    """O id só vale se estiver no índice (nada de montar caminho de arquivo com texto do usuário)."""
    return next((t for t in indice() if t["id"] == id_), None)


def montar_trajeto(trajeto: dict, status: dict) -> dict:
    """Trajeto classificado com as faixas ativas do cache `status` (formato de status_geral()).

    Sem dado válido (cache vazio ou qualquer faixa indisponível), não classifica nada:
    "sem faixa ativa" só pode ser dito quando todas as faixas têm dado.
    """
    faixas = status.get("faixas") or {}
    base = {"status": "indisponivel", "gerado_em": status.get("gerado_em"), "trajeto": trajeto,
            "total_km": None, "totais_km": None, "trechos": None}
    if status.get("status") != "ok" or not faixas or INDISPONIVEL in faixas.values():
        return base

    ativas = set(faixas_ativas(faixas))
    metros = dict.fromkeys(CLASSES, 0)
    feats = []
    for f in _geojson(trajeto["id"])["features"]:
        classe = classificar_trecho(f["properties"]["faixas"], ativas)
        m = f["properties"]["m"]
        metros[classe] += m
        feats.append({"type": "Feature", "properties": {"classe": classe, "m": m}, "geometry": f["geometry"]})
    base.update(
        status="ok",
        total_km=round(sum(metros.values()) / 1000, 3),
        totais_km={c: round(metros[c] / 1000, 3) for c in CLASSES},
        trechos={"type": "FeatureCollection", "features": feats},
    )
    return base
