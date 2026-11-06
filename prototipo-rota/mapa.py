"""Gera saida/mapa_<viagem>_<cenario>.html (Folium) com a exposição do trajeto às faixas do PDDU.

Protótipo acadêmico, fora do app. O trajeto é o mais curto por distância (ver trajeto.py);
as cores só mostram exposição, não orientam a escolha do caminho.
Uso: python prototipo-rota/mapa.py
"""
from html import escape

import folium

from trajeto import (AQUI, ATIVA, CENARIOS, CLASSES, MAPEADA, NAO_AVALIADO, carregar_grafo,
                     carregar_trechos, carregar_viagens, classificar)

SAIDA = AQUI / "saida"
TOLERANCIA = 0.01

ESTILO = {
    ATIVA: {"color": "#c62828", "weight": 6, "opacity": 0.9},
    MAPEADA: {"color": "#f9a825", "weight": 6, "opacity": 0.9},
    NAO_AVALIADO: {"color": "#757575", "weight": 4, "opacity": 0.8, "dash_array": "8 8"},
}
LEGENDA = {
    ATIVA: "Faixa ativa no cenário",
    MAPEADA: "Área mapeada pelo PDDU, sem faixa ativa",
    NAO_AVALIADO: "Fora das áreas mapeadas: não avaliado (não significa seguro)",
}
NOTA_METRICA = "Métrica de exposição do PDDU. Não é recomendação de rota."
AVISO_FINAL = "Mapa acadêmico. Não substitui a Defesa Civil (199)."


def _juntar(fatias):
    """Une fatias consecutivas da mesma classe numa só linha (lat, lon)."""
    grupos = []
    for geo, classe, _ in fatias:
        pts = [(y, x) for x, y in geo.coords]
        if grupos and grupos[-1][0] == classe:
            grupos[-1][1].extend(pts[1:])
        else:
            grupos.append((classe, pts))
    return grupos


def _amostra(classe):
    e = ESTILO[classe]
    borda = "dashed" if "dash_array" in e else "solid"
    return f'<span style="display:inline-block;width:28px;border-top:4px {borda} {e["color"]};vertical-align:middle;margin-right:6px"></span>'


def _painel(viagem, cenario, r):
    caixa = ("position:fixed;z-index:9999;background:#fff;color:#222;padding:10px 12px;border-radius:6px;"
             "box-shadow:0 1px 4px rgba(0,0,0,.35);font:13px/1.4 system-ui,sans-serif;max-width:340px")
    legenda = "".join(f"<div>{_amostra(c)}{escape(LEGENDA[c])}</div>" for c in CLASSES)
    km = r["km"]
    numeros = (f"<div>Km total: <b>{r['km_total']:.2f}</b></div>"
               f"<div>Km em faixa ativa: <b>{km[ATIVA]:.2f}</b></div>"
               f"<div>Km em área mapeada sem faixa ativa: <b>{km[MAPEADA]:.2f}</b></div>"
               f"<div>Km não avaliados: <b>{km[NAO_AVALIADO]:.2f}</b></div>")
    return (f'<div style="{caixa};top:10px;right:10px"><b>{escape(viagem["nome"])}</b><br>'
            f'Cenário: {escape(cenario["rotulo"])}<hr style="margin:6px 0">{numeros}'
            f'<hr style="margin:6px 0"><i>{escape(NOTA_METRICA)}</i></div>'
            f'<div style="{caixa};bottom:24px;left:10px">{legenda}'
            f'<hr style="margin:6px 0"><b>{escape(AVISO_FINAL)}</b></div>')


def gerar(viagem, chave, cenario, g, trechos, por_id, arvore):
    r = classificar(viagem, cenario["ativas"], g, trechos, por_id, arvore)
    o, d = viagem["origem"], viagem["destino"]
    m = folium.Map(location=[(o["lat"] + d["lat"]) / 2, (o["lon"] + d["lon"]) / 2], zoom_start=14, tiles="OpenStreetMap")
    for classe, pts in _juntar(r["fatias"]):
        folium.PolyLine(pts, tooltip=classe, **ESTILO[classe]).add_to(m)
    folium.Marker([o["lat"], o["lon"]], tooltip="Origem").add_to(m)
    folium.Marker([d["lat"], d["lon"]], tooltip="Destino", icon=folium.Icon(color="black")).add_to(m)
    m.fit_bounds([[p[0], p[1]] for _, pts in _juntar(r["fatias"]) for p in pts])
    m.get_root().html.add_child(folium.Element(_painel(viagem, cenario, r)))
    arq = SAIDA / f"mapa_{viagem['id']}_{chave}.html"
    m.save(arq)
    return arq, r


def verificar(arq, r):
    soma, total = sum(r["km"].values()), r["km_total"]
    assert abs(soma - total) <= TOLERANCIA * total, f"{arq.name}: soma {soma:.3f} km != total {total:.3f} km"
    texto = arq.read_text(encoding="utf-8").lower().replace(LEGENDA[NAO_AVALIADO].lower(), "")
    # Radical montado por partes para que a busca no próprio código só ache a frase da legenda.
    for palavra in ("se" + "gur", "menos risco"):
        assert palavra not in texto, f"{arq.name}: contém '{palavra}' fora da frase permitida da legenda"
    return soma / total


def main():
    SAIDA.mkdir(exist_ok=True)
    g = carregar_grafo()
    trechos, por_id, arvore = carregar_trechos()
    for viagem in carregar_viagens():
        for chave, cenario in CENARIOS.items():
            arq, r = gerar(viagem, chave, cenario, g, trechos, por_id, arvore)
            razao = verificar(arq, r)
            print(f"{arq.name}: total {r['km_total']:.2f} km | "
                  + " | ".join(f"{c}: {r['km'][c]:.2f}" for c in CLASSES) + f" | soma/total {razao:.4f} OK")


if __name__ == "__main__":
    main()
