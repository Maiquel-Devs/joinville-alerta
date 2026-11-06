"""Baixa uma vez a rede dirigível de Joinville (OpenStreetMap, via osmnx) e salva em cache/.

Protótipo acadêmico, fora do app. Sem chaves de API nem serviços pagos (Overpass público).
Uso: python prototipo-rota/gerar_grafo.py [--forcar]
"""
import sys
from pathlib import Path

import osmnx as ox

AQUI = Path(__file__).resolve().parent
GRAFO = AQUI / "cache" / "grafo.graphml"
LUGAR = "Joinville, Santa Catarina, Brazil"


def main():
    if GRAFO.exists() and "--forcar" not in sys.argv:
        print(f"Grafo já existe em {GRAFO} (use --forcar para baixar de novo).")
        return
    GRAFO.parent.mkdir(parents=True, exist_ok=True)
    print(f"Baixando rede dirigível de {LUGAR}...")
    g = ox.graph_from_place(LUGAR, network_type="drive")
    ox.save_graphml(g, GRAFO)
    print(f"{g.number_of_nodes()} nós, {g.number_of_edges()} arestas -> {GRAFO}")


if __name__ == "__main__":
    main()
