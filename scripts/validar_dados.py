"""Valida os JSON/GeoJSON servidos ao app. Só biblioteca padrão; roda no CI.

Uso (da raiz do repositório): python scripts/validar_dados.py
Sai com código 1 se algum arquivo falhar.
"""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAX_CASAS = 5  # CLAUDE.md: GeoJSON servido tem no máximo 5 casas decimais
GEOJSON = sorted((RAIZ / "data" / "geojson").glob("*.geojson")) + [RAIZ / "data" / "ruas_risco.geojson"]
JSON_SERVIDOS = [RAIZ / "manifest.json"]
JSON_DERIVADOS = sorted((RAIZ / "data" / "derivados").glob("*.json"))
TIPOS_GEOM = {"Polygon", "MultiPolygon", "LineString", "MultiLineString", "Point", "MultiPoint"}


def casas(texto):
    """Casas decimais de um número escrito em JSON."""
    mantissa = re.split(r"[eE]", texto)[0]
    return len(mantissa.split(".")[1]) if "." in mantissa else 0


def carregar(caminho, erros):
    maior = [0]

    def num(texto):
        maior[0] = max(maior[0], casas(texto))
        return float(texto)

    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f, parse_float=num), maior[0]
    except (OSError, ValueError) as e:
        erros.append(f"{caminho.relative_to(RAIZ)}: não abre como JSON ({e})")
        return None, 0


def validar_geojson(caminho, erros):
    nome = caminho.relative_to(RAIZ)
    dados, casas_max = carregar(caminho, erros)
    if dados is None:
        return
    if dados.get("type") != "FeatureCollection" or not isinstance(dados.get("features"), list):
        erros.append(f"{nome}: não é uma FeatureCollection")
        return
    if not dados["features"]:
        erros.append(f"{nome}: sem nenhuma feature")
    for i, feat in enumerate(dados["features"]):
        geom = feat.get("geometry") or {}
        if feat.get("type") != "Feature" or geom.get("type") not in TIPOS_GEOM or not geom.get("coordinates"):
            erros.append(f"{nome}: feature {i} sem geometria válida")
            break
    if casas_max > MAX_CASAS:
        erros.append(f"{nome}: {casas_max} casas decimais (máximo {MAX_CASAS})")
    print(f"ok  {nome}: {len(dados['features'])} features, até {casas_max} casas")


def validar_sw(erros):
    """Todo arquivo listado no Service Worker precisa existir; senão o install do SW falha."""
    texto = (RAIZ / "sw.js").read_text(encoding="utf-8")
    bloco = re.search(r"ASSETS_TO_CACHE\s*=\s*\[(.*?)\]", texto, re.S)
    if not bloco:
        erros.append("sw.js: ASSETS_TO_CACHE não encontrado")
        return
    for rel in re.findall(r"'\./([^']*)'", bloco.group(1)):
        if rel and not (RAIZ / rel).is_file():
            erros.append(f"sw.js: '{rel}' está na lista de cache mas não existe")
    print("ok  sw.js: arquivos da lista de cache existem")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    erros = []
    for caminho in GEOJSON:
        if not caminho.is_file():
            erros.append(f"{caminho.relative_to(RAIZ)}: arquivo ausente")
        else:
            validar_geojson(caminho, erros)
    for caminho in JSON_SERVIDOS + JSON_DERIVADOS:
        dados, _ = carregar(caminho, erros)
        if dados is not None:
            print(f"ok  {caminho.relative_to(RAIZ)}")
    validar_sw(erros)
    for e in erros:
        print(f"ERRO {e}")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
