#!/usr/bin/env python3
"""Consolida em `data/derivados/ativacoes.md` quantas vezes por ano cada gatilho acenderia (tarefa 6.7).

Só lê os JSON já derivados (`frequencia_chuva.json`, `vies_open_meteo.json`, `frequencia_mare.json`);
não toca nos dados brutos. Não decide nenhum gatilho: a escolha dos alvos é a tarefa 6.3 (do autor).

Fonte dos dados das estações: Dos Santos-Silva, J. C. (2026), DOI 10.5281/zenodo.21682712, CC BY 4.0.

Uso:  python scripts/consolidar_ativacoes.py
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DER = RAIZ / "data" / "derivados"

CHUVA_ATUAL_MM = 30
MARE_1_6, MARE_2_5 = 1.60, 2.53
LIMIARES_CHUVA = [20, 30, 40, 50, 60, 80, 100]
ALVOS = [  # nome, eventos/ano
    ("TR 2 (maré 1,6 m, ~2 anos a confirmar)", 0.5),
    ("TR 5", 0.2),
    ("TR 10", 0.1),
    ("TR 25", 0.04),
]
AVISO_GERAL = (10, 3)  # eventos/ano: de "mais frequente" a "menos frequente"


def br(x: float, casas: int) -> str:
    """Número em texto corrido com vírgula decimal (as tabelas ficam com ponto, como nos outros relatórios)."""
    return f"{x:.{casas}f}".replace(".", ",")


def carregar(nome: str) -> dict:
    return json.loads((DER / nome).read_text(encoding="utf-8"))


def limiar_para_taxa(curva: dict, alvo: float, anos: float, passo: float = 1.0):
    """Menor limiar (da grade) cuja taxa observada fica <= alvo. Devolve (limiar, extrapolacao)."""
    pontos = sorted((float(k), v) for k, v in curva.items())
    for x, taxa in pontos:
        if taxa <= alvo:
            return x, (1 / alvo) > anos
    return None, True


def taxa_em_chuva(curva: dict, x: float) -> float:
    return curva[str(int(x))]


def taxa_em(curva: dict, x: float) -> float | None:
    """Taxa no limiar mais próximo da grade (a grade de maré é de 0,05 m)."""
    chaves = {float(k): v for k, v in curva.items()}
    k = min(chaves, key=lambda c: abs(c - x))
    return chaves[k] if abs(k - x) <= 0.03 else None


def main():
    ch = carregar("frequencia_chuva.json")
    vi = carregar("vies_open_meteo.json")
    ma = carregar("frequencia_mare.json")
    om = vi["open_meteo_completo"]

    fontes = {
        "Iate Clube": (ch["iateclube"]["curva_eventos_ano"], ch["iateclube"]["anos_de_observacao_com_janela_valida"], ch["iateclube"]),
        "Flotflux": (ch["flotflux"]["curva_eventos_ano"], ch["flotflux"]["anos_de_observacao_com_janela_valida"], ch["flotflux"]),
        "Águas de Joinville": (ch["aguasdejoi"]["curva_eventos_ano"], ch["aguasdejoi"]["anos_de_observacao_com_janela_valida"], ch["aguasdejoi"]),
        "Open-Meteo 2018–2026 (produção)": (om["curva_eventos_ano"], om["anos"], om),
    }
    nomes = list(fontes)

    def t(c, x):
        return c[str(x)] if str(x) in c else c.get(x)

    L = [
        "# Ativações: quantas vezes por ano cada gatilho acenderia (derivado)",
        "",
        "Gerado por `scripts/consolidar_ativacoes.py` (tarefa 6.7) a partir de `frequencia_chuva.json`, `vies_open_meteo.json` e `frequencia_mare.json`. "
        "**Nenhum gatilho foi alterado.** Este relatório é a base da escolha de alvos (tarefa 6.3, decisão do autor).",
        "",
        "**Fonte das estações:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). "
        "Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. CC BY 4.0. Termos da SEPROT ainda sem confirmação formal. "
        "Open-Meteo: Historical Forecast API, CC BY 4.0.",
        "",
        "**Limites desta etapa:** a tarefa 6.6 (histórico ao vivo) ainda não existe, então só há o histórico das estações e da Open-Meteo, **sem registro ao vivo do app**. "
        "A série das estações tem 5 a 12 anos válidos; taxas abaixo de ~1 evento por 10 anos e o nível de 25 anos são extrapolação.",
        "",
        "## Resposta curta: com os limiares de hoje, quantas vezes por ano o app ficaria vermelho?",
        "",
    ]

    # --- resposta curta
    r30 = {n: t(fontes[n][0], CHUVA_ATUAL_MM) for n in nomes}
    sensores = [r30[n] for n in nomes[:3]]
    L += [
        f"- **Chuva ≥ {CHUVA_ATUAL_MM} mm em 24 h:** acenderia **{br(r30['Open-Meteo 2018–2026 (produção)'], 1)} vezes por ano** com a Open-Meteo (a fonte de produção) "
        f"e {br(min(sensores), 1)} a {br(max(sensores), 1)} vezes por ano segundo os sensores (Iate Clube {br(r30['Iate Clube'], 1)}; Flotflux {br(r30['Flotflux'], 1)}; Águas {br(r30['Águas de Joinville'], 1)}). "
        "Isso é de 1 a 2 eventos por mês. Um evento de 25 anos deveria acender 0,04 vez por ano: o limiar atual acende **cerca de 300 a 500 vezes mais**. "
        "Desde a tarefa 5.7 a chuva **não pinta ruas**: vira aviso geral (âmbar). Antes da 5.7 seria vermelho nessa frequência.",
    ]
    a = ma["regimes"]["A"]
    ca = a["curva_episodios_ano"]
    L += [
        f"- **Maré ≥ {MARE_1_6:.2f} m (`mare_1_6`):** na régua do Iate Clube (regime A, 2011–2016, 5,2 anos) a régua passou de 1,60 m em **{br(taxa_em(ca, 1.6), 1)} episódios por ano**; "
        f"de 2,53 m, em **{br(taxa_em(ca, 2.55) or 0.0, 1)} por ano** (nunca na série confiável). "
        "**Isto não é a frequência do gatilho de produção:** o gatilho usa a 'maré efetiva' do CIRAM em outro referencial, e a relação entre as duas réguas ainda não foi medida (tarefa 6.5). "
        "Veja a seção de maré para a leitura com a hipótese 'nível acima da mediana'.",
        "",
        "## Chuva (faixas `pluvial_vn_tr5`, `pluvial_vn_tr10`, `pluvial_vn_tr25` e aviso geral `chuva_forte`)",
        "",
        "### Eventos por ano acima de cada limiar de chuva de 24 h",
        "",
        "Evento = trecho com a chuva de 24 h acima do limiar, fundidos quando separados por menos de 24 h. Linha **em destaque** = limiar atual.",
        "",
        "| Limiar (mm) | " + " | ".join(nomes) + " |",
        "|--:|" + "--:|" * len(nomes),
    ]
    for x in LIMIARES_CHUVA:
        cel = " | ".join(f"{t(fontes[n][0], x):.2f}" for n in nomes)
        rot = f"**{x} (atual)**" if x == CHUVA_ATUAL_MM else str(x)
        L.append(f"| {rot} | {cel} |")
    L += ["", "Anos de dados válidos por fonte: " + "; ".join(f"{n}: {fontes[n][1]}" for n in nomes) + ".", ""]

    L += [
        "### O que os alvos pedem",
        "",
        "Limiar de chuva de 24 h (mm) que produziria a taxa-alvo, **lido da própria curva de cada fonte** (menor limiar inteiro com taxa ≤ alvo). "
        "Para a Open-Meteo isso já embute o viés dela; é o número que valeria para o gatilho de produção. "
        "Entre parênteses, o nível de retorno por Gumbel (IC 95% por bootstrap), quando a fonte tem anos suficientes. "
        "**\\*** = alvo mais raro que 1 evento por série inteira, ou limiar acima do maior valor observado: **extrapolação**.",
        "",
        "| Alvo (eventos/ano) | " + " | ".join(nomes) + " |",
        "|--|" + "--|" * len(nomes),
    ]
    alvos_chuva = [("Aviso geral, mais frequente: 10/ano", 10.0), ("Aviso geral, menos frequente: 3/ano", 3.0)] + [(f"Faixa {n} ({a}/ano)", a) for n, a in ALVOS[1:]]
    for rot, alvo in alvos_chuva:
        cel = []
        for n in nomes:
            curva, anos, dados = fontes[n]
            x, extra = limiar_para_taxa(curva, alvo, anos)
            txt = "> 250" if x is None else f"{x:.0f}{'*' if extra or taxa_em_chuva(curva, x) == 0 else ''}"
            tr = round(1 / alvo)
            gb = dados.get("gumbel", {}).get(str(tr)) if alvo <= 0.5 else None
            if gb and gb.get("ic95_mm"):
                txt += f" (Gumbel {gb['nivel_mm']}; IC {gb['ic95_mm'][0]}–{gb['ic95_mm'][1]})"
            cel.append(txt)
        L.append(f"| {rot} | " + " | ".join(cel) + " |")
    L += [
        "",
        f"O limiar de hoje é {CHUVA_ATUAL_MM} mm e acende {br(r30['Open-Meteo 2018–2026 (produção)'], 1)} vezes por ano na Open-Meteo, **acima do teto de 10/ano** do alvo de aviso geral. "
        f"Pela curva da Open-Meteo, 10/ano corresponde a ~{limiar_para_taxa(om['curva_eventos_ano'], 10.0, om['anos'])[0]:.0f} mm e 3/ano a ~{limiar_para_taxa(om['curva_eventos_ano'], 3.0, om['anos'])[0]:.0f} mm.",
        "",
        "Leitura do viés (de `vies_open_meteo.md`): nos limiares altos a Open-Meteo **subestima** a estação (p99 da chuva de 24 h entre 0,59 e 0,85 da estação; "
        "ela encontra menos da metade dos eventos de 30 mm das estações). Portanto, um limiar que dê a taxa certa **na Open-Meteo** fica abaixo do limiar equivalente na estação. "
        "A última coluna da tabela já está em unidades da Open-Meteo, que é o que o gatilho de produção enxerga.",
        "",
        "## Maré (faixas `mare_1_6`, `mare_2_5` e aviso geral `mare_alta`; Itaum fica em `mare_2_5`, decisão de 29/10/2026)",
        "",
        "> **Tudo em metros na régua do Iate Clube, regime A (2011–2016).** O regime B (2021–abr/2025) tem outro zero e teto de sensor em 2,5 m, e foi deixado de fora das taxas. "
        "A régua não é o referencial do PDDU. **Estas taxas não são a frequência dos gatilhos de produção.**",
        "",
        "### Episódios por ano acima de cada nível (régua, regime A, 5,2 anos)",
        "",
        "| Nível na régua (m) | Episódios/ano | Dias/ano | Horas/ano | Observação |",
        "|--:|--:|--:|--:|--|",
    ]
    for x, v in a["niveis_tabela"].items():
        obs = {"1.6": "valor literal do gatilho `mare_1_6`", "2.53": "valor literal do gatilho `mare_2_5`"}.get(x, "")
        L.append(f"| {x} | {v['episodios_ano']} | {v['dias_ano']} | {v['horas_ano']} | {obs} |")
    med = a["mediana_m"]
    L += [
        "",
        f"### Hipótese: gatilho = altura acima do nível médio (mediana da régua = {med} m)",
        "",
        "O CIRAM informa a 'maré efetiva (m acima do NMM)'. **Se** o nível médio do mar for a mediana da régua do Iate Clube (hipótese de `analise_mare_qc.py`, **não confirmada**), "
        "os gatilhos equivalem a estes níveis na régua:",
        "",
        "| Gatilho | Nível equivalente na régua (m) | Episódios/ano (grade de 0,05 m) |",
        "|--|--:|--:|",
    ]
    for nome, g in (("mare_1_6 (1,60 m)", MARE_1_6), ("mare_2_5 (2,53 m)", MARE_2_5)):
        x = g + med
        taxa = taxa_em(ca, x)
        L.append(f"| {nome} | {x:.2f} | {'sem dado na grade (acima do máximo observado)' if taxa is None else taxa} |")
    L += [
        "",
        "### O que os alvos de maré pedem (régua, regime A)",
        "",
        "| Alvo | Eventos/ano | Nível na régua (m), pela curva observada | Gumbel (IC 95%) | Obs. |",
        "|--|--:|--:|--|--|",
    ]
    for rot, alvo, tr in (("`mare_1_6` ~TR 2 (a confirmar)", 0.5, 2), ("`mare_2_5` ~TR 10 (a confirmar)", 0.1, 10)):
        x, _ = limiar_para_taxa(ca, alvo, a["anos_com_nivel"], 0.05)
        g = a["gumbel"][str(tr)]
        extra = "extrapolação (série de 5,2 anos)" if tr >= 5 else "dentro da série, mas com só 5 máximos"
        L.append(f"| {rot} | {alvo} | {x:.2f} | {g['nivel_m']} ({g['ic95_m'][0]}–{g['ic95_m'][1]}) | {extra} |")
    L += [
        "",
        "Ler assim: se a régua do Iate Clube valesse como referencial do PDDU, o alvo de ~2 anos pediria cerca de 1,6 a 1,75 m e o de ~10 anos cerca de 1,9 a 2,0 m (Gumbel e curva observada), "
        "ou seja, o 2,53 m atual ficaria **muito acima** do que um evento de 10 anos alcança nessa régua (nunca atingido em 5 anos). "
        "Como o zero da régua não é o do PDDU, isso fica **como indício**, a confirmar na tarefa 6.5.",
        "",
        "## O que isto não responde",
        "",
        "- **Registro ao vivo do app:** não existe (tarefa 6.6). Estes números são retrospectivos.",
        "- **Pluviômetro de referência (6.3):** as séries são os sensores de chuva de três estações hidrometeorológicas, não a rede de pluviômetros; "
        "Iate Clube e Águas têm meses de sensor parado removidos (muitos anos sem máximo utilizável); só o Flotflux tem 9 anos de máximo anual.",
        "- **Maré em produção:** a relação entre o CIRAM e o Iate Clube (6.5) e o referencial vertical continuam abertos.",
        "- **Qual alvo vale:** é a decisão da tarefa 6.3 ⚖️, do autor.",
        "",
    ]
    (DER / "ativacoes.md").write_text("\n".join(L), encoding="utf-8")
    print("Gravado", DER / "ativacoes.md")


if __name__ == "__main__":
    main()
