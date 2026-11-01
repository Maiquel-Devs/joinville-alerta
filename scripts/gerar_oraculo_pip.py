"""Gera teste/pip_oraculo.json: 12.000 pontos aleatórios e, para cada faixa, se o shapely os considera
dentro da área mapeada. O teste do front (teste/pip.test.js) compara o pip.js com esse oráculo.

Uso (precisa de shapely; só quando as áreas mapeadas mudarem):
    python scripts/gerar_oraculo_pip.py
"""
import json
import random
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

RAIZ = Path(__file__).resolve().parent.parent
GEO = RAIZ / "data" / "geojson"
SAIDA = RAIZ / "teste" / "pip_oraculo.json"
N_PONTOS = 12000
SEMENTE = 20261101

# faixa -> (arquivo, tempretor ou None). Vila Nova: só o cenário "Atual" (igual ao filtro do front).
FAIXAS = {
    "mare_1_6": ("mare_cachoeira_1_6m.geojson", None),
    "mare_2_5": ("mare_cachoeira_2_5m.geojson", None),
    "pluvial_vn_tr5": ("inundacao_vila_nova.geojson", "5 anos"),
    "pluvial_vn_tr10": ("inundacao_vila_nova.geojson", "10 anos"),
    "pluvial_vn_tr25": ("inundacao_vila_nova.geojson", "25 anos"),
}


def carregar(arquivo, tr):
    col = json.loads((GEO / arquivo).read_text(encoding="utf-8"))
    geoms = [
        shape(f["geometry"])
        for f in col["features"]
        if tr is None or (f["properties"].get("status_1") == "Atual" and f["properties"].get("tempretor") == tr)
    ]
    return geoms


def main():
    camadas = {}
    xs, ys = [], []
    for faixa, (arq, tr) in FAIXAS.items():
        geoms = camadas[faixa] = carregar(arq, tr)
        x0, y0, x1, y1 = unary_union(geoms).bounds
        xs += [x0, x1]
        ys += [y0, y1]
    caixa = (min(xs), min(ys), max(xs), max(ys))

    rnd = random.Random(SEMENTE)
    pontos = [[round(rnd.uniform(caixa[0], caixa[2]), 6), round(rnd.uniform(caixa[1], caixa[3]), 6)] for _ in range(N_PONTOS)]

    esperado = {}
    for faixa, geoms in camadas.items():
        preparadas = [prep(g) for g in geoms]
        bits = "".join("1" if any(p.contains(Point(x, y)) for p in preparadas) else "0" for x, y in pontos)
        esperado[faixa] = bits
        print(f"{faixa}: {bits.count('1')} de {N_PONTOS} pontos dentro")

    SAIDA.write_text(
        json.dumps({"semente": SEMENTE, "caixa": caixa, "oraculo": "shapely.contains", "pontos": pontos, "esperado": esperado}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"gravado {SAIDA} ({SAIDA.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
