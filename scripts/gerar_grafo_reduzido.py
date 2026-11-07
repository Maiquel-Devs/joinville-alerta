"""Gera data/grafo_reduzido.json.gz: a rede de ruas só com o que o back-end precisa para calcular caminhos.

Uso (precisa de osmnx; ver prototipo-rota/requirements.txt):
    python scripts/gerar_grafo_reduzido.py

- Lê cache/grafo.graphml (o mesmo grafo dirigível do OpenStreetMap usado por gerar_trajetos.py, salvo
  fora do git) e data/ruas_risco.geojson. O osmnx fica só neste script: o back-end lê o resultado com
  a biblioteca padrão e networkx, sem osmnx (custo zero no Render).
- Grava só isto, em JSON comprimido (gzip), sem pickle:
    nos:     [id, lat, lon]                              (só nós que têm aresta)
    arestas: [u, v, comprimento_m, osmid, nomes, faixas]  (dirigidas, como no grafo original)
  `osmid` é a lista de ids OSM da aresta; `nomes`, a lista de nomes (vazia se a via não tem nome);
  `faixas`, a união das faixas de ruas_risco.geojson para esses ids (vazia = fora das áreas mapeadas).
- A classe de cada aresta (faixa ativa, área sem faixa ativa, não avaliado) NÃO é gravada: o back-end a
  calcula com as faixas ativas do momento. Nenhum critério de risco entra neste arquivo além das faixas.
- A faixa vale para a aresta inteira (por id). É mais grosseira que a de gerar_trajetos.py, que fatia
  a via a cada 5 m e só conta o que está a até 15 m do trecho mapeado.
"""
import gzip
import json
from pathlib import Path

import osmnx as ox

RAIZ = Path(__file__).resolve().parent.parent
GRAFO = RAIZ / "cache" / "grafo.graphml"
RUAS = RAIZ / "data" / "ruas_risco.geojson"
SAIDA = RAIZ / "data" / "grafo_reduzido.json.gz"
CASAS = 5
META_BYTES = 3 * 1024 * 1024


def lista(valor):
    if valor is None:
        return []
    return list(valor) if isinstance(valor, (list, tuple, set)) else [valor]


def faixas_por_id():
    mapa = {}
    for f in json.loads(RUAS.read_text(encoding="utf-8"))["features"]:
        mapa.setdefault(int(f["properties"]["osm"]), set()).update(f["properties"]["faixas"])
    return mapa


def main():
    g = ox.load_graphml(GRAFO)
    faixas = faixas_por_id()
    arestas = []
    usados = set()
    for u, v, d in g.edges(data=True):
        ids = sorted(int(k) for k in lista(d["osmid"]))
        nomes = [str(n) for n in lista(d.get("name"))]
        fx = sorted(set().union(*(faixas.get(i, set()) for i in ids)))
        arestas.append([int(u), int(v), round(float(d["length"]), 1), ids, nomes, fx])
        usados.update((int(u), int(v)))
    arestas.sort(key=lambda a: (a[0], a[1], a[2]))
    nos = sorted([n, round(float(g.nodes[n]["y"]), CASAS), round(float(g.nodes[n]["x"]), CASAS)] for n in usados)
    texto = json.dumps({"versao": 1, "nos": nos, "arestas": arestas}, ensure_ascii=False, separators=(",", ":"))
    with open(SAIDA, "wb") as bruto, gzip.GzipFile(fileobj=bruto, mode="wb", compresslevel=9, mtime=0) as gz:
        gz.write(texto.encode("utf-8"))
    tam = SAIDA.stat().st_size
    com_faixa = sum(1 for a in arestas if a[5])
    print(f"{SAIDA.name}: {len(nos)} nós, {len(arestas)} arestas ({com_faixa} com faixa PDDU), "
          f"{tam / 1024 / 1024:.2f} MB comprimido, {len(texto) / 1024 / 1024:.1f} MB sem comprimir")
    if tam > META_BYTES:
        raise SystemExit(f"passa da meta de {META_BYTES // 1024 // 1024} MB")


if __name__ == "__main__":
    main()
