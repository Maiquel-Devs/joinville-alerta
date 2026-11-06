"""Gera data/trajetos/: os trajetos fixos do mapa e as faixas do PDDU em cada trecho.

Uso (precisa de osmnx; ver prototipo-rota/requirements.txt):
    python scripts/gerar_trajetos.py [--forcar-grafo]

- Lê data/ruas_risco.geojson e a rede de ruas dirigível do OpenStreetMap (osmnx), salva uma
  vez em cache/grafo.graphml (fora do git). Sem chave de API nem serviço pago.
- O trajeto é o caminho mais curto POR DISTÂNCIA (networkx, weight="length"). Nenhum critério
  de risco entra na escolha; as faixas só são cruzadas depois, para descrever o que já foi escolhido.
- Cada trecho do trajeto guarda as FAIXAS do PDDU que o cobrem (lista vazia = fora das áreas
  mapeadas = "não avaliado") e o comprimento em metros. A CLASSE (faixa ativa, área sem faixa
  ativa, não avaliado) NÃO é gravada aqui: o back-end a calcula com as faixas ativas do momento.

Cruzamento: a propriedade `osm` de ruas_risco.geojson é o id da way do OpenStreetMap. Como o
pipeline recorta cada way nas bordas das áreas mapeadas, o id sozinho não basta: cada aresta é
fatiada a cada PASSO_M metros, e a fatia só recebe as faixas de trechos de MESMO id a até
TOL_M metros. Nenhuma saída de texto deste script chama um trecho de "seguro".
"""
import json
import sys
from pathlib import Path

import networkx as nx
import numpy as np
import osmnx as ox
import shapely
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, shape

RAIZ = Path(__file__).resolve().parent.parent
GRAFO = RAIZ / "cache" / "grafo.graphml"
RUAS = RAIZ / "data" / "ruas_risco.geojson"
SAIDA = RAIZ / "data" / "trajetos"

LUGAR = "Joinville, Santa Catarina, Brazil"
TOL_M = 15.0
PASSO_M = 5.0
CASAS = 5
MAX_BYTES = 100 * 1024

TRAJETOS = [
    {"id": "centro_boa_vista", "nome": "Centro → Boa Vista",
     "origem": {"nome": "Praça Nereu Ramos", "lat": -26.3027975, "lon": -48.8457656},
     "destino": {"nome": "Bairro Boa Vista", "lat": -26.2998404, "lon": -48.8229801}},
    {"id": "rodoviaria_mueller", "nome": "Rodoviária → Shopping Mueller",
     "origem": {"nome": "Rodoviária Harold Nielson", "lat": -26.31497, "lon": -48.85741},
     "destino": {"nome": "Shopping Mueller", "lat": -26.3036366, "lon": -48.848978}},
]

_UTM = Transformer.from_crs(4326, 31982, always_xy=True).transform
_WGS = Transformer.from_crs(31982, 4326, always_xy=True).transform


def transformar(func, geom):
    return shapely.transform(geom, lambda c: np.column_stack(func(c[:, 0], c[:, 1])))


def _ids(osmid):
    return set(osmid) if isinstance(osmid, (list, tuple, set)) else {osmid}


def carregar_grafo(forcar=False):
    if forcar or not GRAFO.exists():
        GRAFO.parent.mkdir(parents=True, exist_ok=True)
        print(f"Baixando a rede dirigível de {LUGAR}...")
        g = ox.graph_from_place(LUGAR, network_type="drive")
        ox.save_graphml(g, GRAFO)
        return g
    return ox.load_graphml(GRAFO)


def carregar_trechos():
    feats = json.loads(RUAS.read_text(encoding="utf-8"))["features"]
    trechos = [{"osm": int(f["properties"]["osm"]), "faixas": set(f["properties"]["faixas"]),
                "geom": transformar(_UTM, shape(f["geometry"]))} for f in feats]
    por_id = {}
    for i, t in enumerate(trechos):
        por_id.setdefault(t["osm"], []).append(i)
    return trechos, por_id


def no_mais_proximo(g, lat, lon):
    nos = list(g.nodes)
    xs, ys = _UTM(np.array([g.nodes[n]["x"] for n in nos]), np.array([g.nodes[n]["y"] for n in nos]))
    x, y = _UTM(lon, lat)
    return nos[int(np.argmin((xs - x) ** 2 + (ys - y) ** 2))]


def _aresta(g, u, v):
    """A aresta paralela de menor comprimento (a mesma que shortest_path usa)."""
    dados = min(g.get_edge_data(u, v).values(), key=lambda d: d["length"])
    geo = dados.get("geometry") or LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])
    return dados, transformar(_UTM, geo)


def fatiar(g, trajeto, trechos, por_id):
    """Fatias de ~PASSO_M metros do caminho mais curto: [(pontos WGS84, metros, faixas ordenadas)]."""
    o, d = trajeto["origem"], trajeto["destino"]
    caminho = nx.shortest_path(g, no_mais_proximo(g, o["lat"], o["lon"]),
                               no_mais_proximo(g, d["lat"], d["lon"]), weight="length")
    fatias = []
    for u, v in zip(caminho[:-1], caminho[1:]):
        dados, linha = _aresta(g, u, v)
        cand = [i for k in _ids(dados["osmid"]) for i in por_id.get(int(k), [])]
        n = max(1, int(np.ceil(linha.length / PASSO_M)))
        for j in range(n):
            ini, fim = linha.interpolate(j / n, normalized=True), linha.interpolate((j + 1) / n, normalized=True)
            meio = LineString([ini, fim]).interpolate(0.5, normalized=True)
            faixas = set()
            for i in cand:
                if trechos[i]["geom"].distance(meio) <= TOL_M:
                    faixas |= trechos[i]["faixas"]
            pontos = [tuple(p) for p in transformar(_WGS, LineString([ini, fim])).coords]
            fatias.append((pontos, ini.distance(fim), tuple(sorted(faixas))))
    return fatias


def juntar(fatias):
    """Une fatias vizinhas de mesmas faixas num só trecho: [(coords, metros, faixas)]."""
    trechos = []
    for pontos, metros, faixas in fatias:
        if trechos and trechos[-1]["faixas"] == faixas:
            trechos[-1]["coords"].append(pontos[1])
            trechos[-1]["m"] += metros
        else:
            trechos.append({"coords": list(pontos), "m": metros, "faixas": faixas})
    return trechos


def para_geojson(trechos):
    feats = []
    for t in trechos:
        coords = [[round(x, CASAS), round(y, CASAS)] for x, y in t["coords"]]
        feats.append({"type": "Feature",
                      "properties": {"faixas": list(t["faixas"]), "m": max(1, round(t["m"]))},
                      "geometry": {"type": "LineString", "coordinates": coords}})
    return {"type": "FeatureCollection", "features": feats}


def gravar(dados, caminho):
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    if len(texto.encode("utf-8")) > MAX_BYTES:
        sys.exit(f"{caminho.name} passa de {MAX_BYTES // 1024} KB")
    caminho.write_text(texto, encoding="utf-8")
    return len(texto.encode("utf-8"))


def main():
    g = carregar_grafo("--forcar-grafo" in sys.argv)
    trechos, por_id = carregar_trechos()
    SAIDA.mkdir(parents=True, exist_ok=True)
    indice = []
    for tr in TRAJETOS:
        juntos = juntar(fatiar(g, tr, trechos, por_id))
        tam = gravar(para_geojson(juntos), SAIDA / f"{tr['id']}.geojson")
        total = sum(t["m"] for t in juntos) / 1000
        sem = sum(t["m"] for t in juntos if not t["faixas"]) / 1000
        print(f"{tr['id']}: {len(juntos)} trechos, {total:.2f} km ({sem:.2f} km sem faixa), {tam / 1024:.1f} KB")
        indice.append({k: tr[k] for k in ("id", "nome", "origem", "destino")})
    gravar(indice, SAIDA / "indice.json")


if __name__ == "__main__":
    main()
