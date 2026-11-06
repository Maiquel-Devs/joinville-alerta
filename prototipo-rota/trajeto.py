"""Trajeto mais curto por distância e exposição às faixas do PDDU, por cenário.

Protótipo acadêmico, fora do app. A ESCOLHA do caminho usa só a distância
(networkx.shortest_path, weight="length"); as faixas entram apenas DEPOIS, para
medir a exposição do caminho já escolhido. Trecho fora das áreas mapeadas é
"não avaliado" e nunca conta como exposição zero.

Cruzamento com data/ruas_risco.geojson: a propriedade `osm` é o id da way do
OpenStreetMap (vem do Overpass em scripts/process_geojson.py). Como o pipeline
corta cada way nas bordas das áreas e descarta o que fica fora, o id sozinho não
basta: a aresta é fatiada a cada PASSO_M metros e cada fatia só recebe a faixa de
um trecho com o MESMO id cuja geometria esteja a até TOL_M metros.

Uso: python prototipo-rota/trajeto.py
"""
import json
from pathlib import Path

import networkx as nx
import numpy as np
import osmnx as ox
from pyproj import Transformer
import shapely
from shapely import STRtree
from shapely.geometry import LineString, shape

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
GRAFO = AQUI / "cache" / "grafo.graphml"
RUAS = RAIZ / "data" / "ruas_risco.geojson"
VIAGENS = AQUI / "viagens.json"

TOL_M = 15.0
PASSO_M = 5.0

CENARIOS = {
    "seco": {"rotulo": "seco", "ativas": set()},
    "mare_1_70": {"rotulo": "maré 1,70 m", "ativas": {"mare_1_6"}},
    "chuva_tr10_115mm": {"rotulo": "chuva TR 10 (115 mm)", "ativas": {"pluvial_vn_tr5", "pluvial_vn_tr10"}},
}

ATIVA = "faixa ativa"
MAPEADA = "área mapeada, sem faixa ativa"
NAO_AVALIADO = "não avaliado"
CLASSES = (ATIVA, MAPEADA, NAO_AVALIADO)

_UTM = Transformer.from_crs(4326, 31982, always_xy=True).transform
_WGS = Transformer.from_crs(31982, 4326, always_xy=True).transform


def transform(func, geom):
    return shapely.transform(geom, lambda c: np.column_stack(func(c[:, 0], c[:, 1])))


def _ids(osmid):
    return set(osmid) if isinstance(osmid, (list, tuple, set)) else {osmid}


def carregar_trechos():
    feats = json.loads(RUAS.read_text(encoding="utf-8"))["features"]
    trechos = []
    for f in feats:
        p = f["properties"]
        trechos.append({"osm": int(p["osm"]), "nome": p["nome"], "faixas": set(p["faixas"]),
                        "geom": transform(_UTM, shape(f["geometry"]))})
    por_id = {}
    for i, t in enumerate(trechos):
        por_id.setdefault(t["osm"], []).append(i)
    return trechos, por_id, STRtree([t["geom"] for t in trechos])


def carregar_grafo():
    if not GRAFO.exists():
        raise SystemExit("Rode antes: python prototipo-rota/gerar_grafo.py")
    return ox.load_graphml(GRAFO)


def no_mais_proximo(g, lat, lon, _cache={}):
    if id(g) not in _cache:
        nos = list(g.nodes)
        xs, ys = _UTM(np.array([g.nodes[n]["x"] for n in nos]), np.array([g.nodes[n]["y"] for n in nos]))
        _cache[id(g)] = (nos, xs, ys)
    nos, xs, ys = _cache[id(g)]
    x, y = _UTM(lon, lat)
    return nos[int(np.argmin((xs - x) ** 2 + (ys - y) ** 2))]


def _aresta(g, u, v):
    """A aresta paralela de menor comprimento (a mesma que shortest_path usa)."""
    dados = min(g.get_edge_data(u, v).values(), key=lambda d: d["length"])
    geo = dados.get("geometry") or LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])
    return dados, transform(_UTM, geo)


def classificar(viagem, ativas, g, trechos, por_id, arvore):
    o, d = viagem["origem"], viagem["destino"]
    caminho = nx.shortest_path(g, no_mais_proximo(g, o["lat"], o["lon"]),
                               no_mais_proximo(g, d["lat"], d["lon"]), weight="length")
    fatias, diag = [], {"id_sem_geometria_m": 0.0, "proximo_outro_id_m": 0.0}
    total_attr = 0.0
    for u, v in zip(caminho[:-1], caminho[1:]):
        dados, linha = _aresta(g, u, v)
        total_attr += dados["length"]
        cand = [i for k in _ids(dados["osmid"]) for i in por_id.get(int(k), [])]
        n = max(1, int(np.ceil(linha.length / PASSO_M)))
        for j in range(n):
            a, b = j / n, (j + 1) / n
            pedaco = LineString([linha.interpolate(a, normalized=True), linha.interpolate(b, normalized=True)])
            meio = pedaco.interpolate(0.5, normalized=True)
            perto = [i for i in cand if trechos[i]["geom"].distance(meio) <= TOL_M]
            if perto:
                faixas = set().union(*(trechos[i]["faixas"] for i in perto))
                classe = ATIVA if faixas & ativas else MAPEADA
            else:
                classe = NAO_AVALIADO
                if cand:
                    diag["id_sem_geometria_m"] += pedaco.length
                elif any(trechos[i]["geom"].distance(meio) <= TOL_M for i in arvore.query(meio.buffer(TOL_M))):
                    diag["proximo_outro_id_m"] += pedaco.length
            fatias.append((transform(_WGS, pedaco), classe, pedaco.length))
    km = {c: sum(m for _, cl, m in fatias if cl == c) / 1000 for c in CLASSES}
    return {"caminho": caminho, "fatias": fatias, "km": km, "km_total": total_attr / 1000, "diag": diag}


def trechos_sem_aresta(g, trechos):
    """Trechos do GeoJSON cujo id de way não aparece em nenhuma aresta do grafo dirigível."""
    ids = set()
    for _, _, osmid in g.edges(data="osmid"):
        ids |= {int(k) for k in _ids(osmid)}
    return [t for t in trechos if t["osm"] not in ids]


def carregar_viagens():
    return json.loads(VIAGENS.read_text(encoding="utf-8"))["viagens"]


def main():
    g = carregar_grafo()
    trechos, por_id, arvore = carregar_trechos()
    falta = trechos_sem_aresta(g, trechos)
    print(f"Trechos do PDDU sem way correspondente no grafo dirigível: {len(falta)} de {len(trechos)} "
          f"({sum(t['geom'].length for t in falta) / 1000:.1f} km)")
    for v in carregar_viagens():
        for chave, c in CENARIOS.items():
            r = classificar(v, c["ativas"], g, trechos, por_id, arvore)
            soma = sum(r["km"].values())
            print(f"{v['id']:18} {c['rotulo']:22} total {r['km_total']:.2f} km | "
                  + " | ".join(f"{k}: {r['km'][k]:.2f}" for k in CLASSES)
                  + f" | soma/total {soma / r['km_total']:.4f}"
                  + f" | id sem geometria a {TOL_M:.0f} m: {r['diag']['id_sem_geometria_m']:.0f} m"
                  + f" | perto de trecho de outro id: {r['diag']['proximo_outro_id_m']:.0f} m")


if __name__ == "__main__":
    main()
