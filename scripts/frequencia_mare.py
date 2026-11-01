#!/usr/bin/env python3
"""Frequência de maré na régua do Iate Clube (tarefa 6.4).

OFFLINE, no computador do autor. Usa o nível horário do Iate Clube já passado pelo QC de
`analise_mare_qc.py` (inválido = ausente; trechos travados saem) e grava
`data/derivados/frequencia_mare.{md,json}`.

**Os valores estão na régua da estação, não no referencial do PDDU.** O zero da régua não é
documentado e muda ao longo da série (ver "Regimes" no relatório). Os resultados valem como
frequência por nível na régua, não como gatilho.

Fonte: Dos Santos-Silva, J. C. (2026), DOI 10.5281/zenodo.21682712, CC BY 4.0.

Uso:  python scripts/frequencia_mare.py   (rode antes `python -I scripts/analise_mare_qc.py`)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analise_mare_qc as qc  # noqa: E402
from chuva_serie import RAIZ, eventos  # noqa: E402
from frequencia_chuva import ajuste  # noqa: E402

SAIDA = RAIZ / "data" / "derivados"
H_ANO = 8766.0
NIVEIS_TABELA = [0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.53]
CURVA = [round(x, 2) for x in np.arange(-0.5, 3.01, 0.05)]
ANO_COBERTURA_MIN = 0.75

# Regimes da régua, definidos pela tabela de estatísticas anuais do próprio relatório:
# A tem mediana ~0,15 m e p99 ~1,25 m todo ano; 2017 derivou (mediana −0,26; p1 −2,7); 2018–2020 têm picos de
# até 3,99 m e 2020 tem 7 h; de 2021 em diante a mediana sobe para ~1,05 m e o mínimo para ~0 (régua
# reposicionada ou sensor cortado embaixo). Misturar os regimes não tem sentido físico.
REGIMES = {
    "A": ("2011-08-29", "2016-12-31", "régua estável (2011–2016); único trecho com ano completo"),
    "B": ("2021-01-01", "2025-04-30", "régua com outro nível médio (2021–abr/2025); cobertura parcial e trechos travados em 2,5 m"),
}


def carregar() -> pd.Series:
    h = qc.carregar_horaria("iateclube")
    nivel, _ = qc.qc_nivel(h["level"])
    return nivel.reindex(pd.date_range(nivel.index.min(), nivel.index.max(), freq="h"))


def estatisticas_anuais(n: pd.Series) -> dict:
    g = n.groupby(n.index.year)
    return {
        int(a): {
            "horas": int(g.count()[a]),
            "p1": round(float(g.quantile(0.01)[a]), 2) if g.count()[a] else None,
            "mediana": round(float(g.median()[a]), 2) if g.count()[a] else None,
            "p99": round(float(g.quantile(0.99)[a]), 2) if g.count()[a] else None,
            "maximo": round(float(g.max()[a]), 2) if g.count()[a] else None,
        }
        for a in g.count().index
    }


def dias_ano(n: pd.Series, acima: pd.Series) -> float:
    """Dias civis com algum nível >= X por ano, contando só dias com >= 20 h válidas (dia parcial não vale)."""
    valido = n.groupby(n.index.normalize()).count() >= 20
    dias_acima = acima.groupby(acima.index.normalize()).any()
    return float((dias_acima & valido).sum()) / max(float(valido.sum()), 1.0) * 365.25


def taxas(n: pd.Series, niveis) -> dict:
    anos = float(n.notna().sum()) / H_ANO
    out = {}
    for x in niveis:
        acima = n >= x
        ep = eventos(n, x)
        out[x] = {
            "episodios_ano": round(len(ep) / anos, 3),
            "dias_ano": round(dias_ano(n, acima), 3),
            "horas_ano": round(float(acima.sum()) / anos, 1),
            "episodios_total": int(len(ep)),
        }
    return out


def em_metros(a: dict) -> dict:
    """O ajuste devolve chaves *_mm (unidade da chuva); aqui a amostra está em metros."""
    return {t: ({"nivel_m": v["nivel_mm"], "ic95_m": v["ic95_mm"]} if isinstance(v, dict) else v) for t, v in a.items()}


def analisar_regime(n: pd.Series, nome: str) -> dict:
    ini, fim, desc = REGIMES[nome]
    s = n[ini:fim]
    mx = s.groupby(s.index.year).max()
    # cobertura contra o ano inteiro (8760 h), não contra as horas da grade
    cob_ano = s.groupby(s.index.year).count() / 8760.0
    anos_ok = [int(a) for a in mx.index if cob_ano[a] >= ANO_COBERTURA_MIN and np.isfinite(mx[a])]
    res = {
        "descricao": desc,
        "periodo": [ini, fim],
        "anos_com_nivel": round(float(s.notna().sum()) / H_ANO, 2),
        "mediana_m": round(float(s.median()), 3),
        "maximo_anual_m": {int(a): round(float(mx[a]), 2) for a in mx.index if np.isfinite(mx[a])},
        "cobertura_anual": {int(a): round(float(cob_ano[a]), 2) for a in mx.index},
        "anos_usados_no_ajuste": anos_ok,
        "niveis_tabela": taxas(s, NIVEIS_TABELA),
        "curva_episodios_ano": {x: v["episodios_ano"] for x, v in taxas(s, CURVA).items()},
    }
    if len(anos_ok) >= 5:
        amostra = np.array([mx[a] for a in anos_ok])
        rng = np.random.default_rng(20261101)
        res["gumbel"] = em_metros(ajuste(amostra, "gumbel", rng, casas=2))
        res["gev"] = em_metros(ajuste(amostra, "gev", rng, casas=2))
    return res


def relatorio(res: dict) -> str:
    L = [
        "# Frequência de maré — Iate Clube (derivado)",
        "",
        "Gerado por `scripts/frequencia_mare.py` (tarefa 6.4). **Resultado derivado**; os dados brutos não estão no repositório.",
        "",
        "**Fonte:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). "
        "Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. Licença CC BY 4.0. Termos da SEPROT ainda sem confirmação formal.",
        "",
        "> **Todos os níveis abaixo estão na régua da estação do Iate Clube, não no referencial do PDDU.** O zero dessa régua não é documentado "
        "e, como mostram os regimes abaixo, **mudou ao longo da série**. Estes números dizem *com que frequência a régua passa de cada nível*; "
        "eles **não** dizem com que frequência o nível 1,60 m ou 2,53 m do PDDU é atingido, e não servem como gatilho direto. "
        "Falta ainda relacionar o marégrafo do CIRAM com esta estação (tarefa 6.5).",
        "",
        "## Método",
        "",
        "- **Série:** nível horário do Iate Clube depois do QC de `analise_mare_qc.py` (fora de [−3; 4] m, travado ≥ 6 h seguidas — inclui os ~13,8 mil h presas em 2,5 m —, zero isolado e picos saem; inválido = ausente, nunca zero).",
        "- **Episódio:** trecho com nível ≥ X; trechos separados por menos de 24 h abaixo de X contam como um episódio (a maré passa de X duas vezes por dia). "
        "**Dia:** dia civil com algum nível ≥ X. Episódios e horas por ano são divididos pelos anos de horas com nível válido; dias por ano, pelos dias com ≥ 20 h válidas. "
        "Em níveis baixos os episódios se fundem (a maré fica o tempo todo acima), então a coluna de episódios cai antes da de horas.",
        f"- **Máximo anual:** calendário civil, só anos com ≥ {int(ANO_COBERTURA_MIN * 100)}% das 8.760 horas válidas, dentro de um único regime. "
        "Ajuste Gumbel e GEV (`scipy.stats`) com IC 95% por bootstrap (2000).",
        "",
        "## Regimes da régua (por que não dá para juntar a série toda)",
        "",
        "| Ano | Horas após QC | p1 (m) | Mediana (m) | p99 (m) | Máximo (m) |",
        "|--|--:|--:|--:|--:|--:|",
    ]
    for a, v in res["estatisticas_anuais"].items():
        if v["horas"]:
            L.append(f"| {a} | {v['horas']} | {v['p1']} | {v['mediana']} | {v['p99']} | {v['maximo']} |")
        else:
            L.append(f"| {a} | 0 | — | — | — | — |")
    L += [
        "",
        "Leitura: 2011–2016 têm mediana ~0,15 m e p99 ~1,25 m todo ano (regime **A**). 2017 deriva (mediana −0,26 m, p1 −2,7 m). "
        "2018–2020 têm picos de até 3,99 m e 2020 tem 7 horas: dado não confiável. Desde 2021 a mediana é ~1,05 m e o mínimo ~0 m (regime **B**), "
        "como se a régua tivesse sido reposicionada ou o sensor cortasse embaixo. Os períodos 2017–2020 ficam **fora**. "
        "Os regimes A e B **não são comparáveis entre si**.",
        "",
    ]
    for nome, r in res["regimes"].items():
        L += [
            f"## Regime {nome}: {r['periodo'][0]} a {r['periodo'][1]}",
            "",
            f"{r['descricao']}. **{r['anos_com_nivel']} anos** de horas com nível; mediana {r['mediana_m']} m."
            + (" **Atenção:** o sensor tem teto em 2,5 m; a partir de 2,2 m os episódios são em boa parte o platô de 2,5 m, então a frequência acima de 2,2 m é um piso incerto, não uma medida." if nome == "B" else ""),
            "",
            "### Frequência de excedência por nível (na régua)",
            "",
            "| Nível (m) | Episódios/ano | Dias/ano | Horas/ano | Episódios na série |",
            "|--:|--:|--:|--:|--:|",
        ]
        for x, v in r["niveis_tabela"].items():
            L.append(f"| {x} | {v['episodios_ano']} | {v['dias_ano']} | {v['horas_ano']} | {v['episodios_total']} |")
        L += ["", "### Máximo anual do nível horário", "", "| Ano | Máximo (m) | Horas válidas / 8.760 | No ajuste |", "|--|--:|--:|:-:|"]
        for a, m in r["maximo_anual_m"].items():
            L.append(f"| {a} | {m} | {int(r['cobertura_anual'][a] * 100)}% | {'sim' if a in r['anos_usados_no_ajuste'] else 'não'} |")
        if "gumbel" in r:
            L += [
                "",
                f"### Níveis de retorno (régua, m) — {len(r['anos_usados_no_ajuste'])} máximos anuais",
                "",
                "| TR (anos) | Gumbel | IC 95% Gumbel | GEV | IC 95% GEV | Obs. |",
                "|--:|--:|--|--:|--|--|",
            ]
            for t in (2, 10):
                g, v = r["gumbel"][t], r["gev"][t]
                if v["ic95_m"] and v["ic95_m"][1] > 10:  # nível de maré acima de 10 m: o GEV divergiu no bootstrap
                    v = {**v, "ic95_m": [v["ic95_m"][0], "instável"]}
                L.append(f"| {t} | {g['nivel_m']} | {g['ic95_m']} | {v['nivel_m']} | {v['ic95_m']} | {'extrapolação (TR > série)' if t >= len(r['anos_usados_no_ajuste']) else ''} |")
            L += [
                "",
                "Valores em **metros**, na régua. "
                f"Com {len(r['anos_usados_no_ajuste'])} máximos o ajuste é frágil; o GEV principalmente (forma ξ = {r['gev']['forma_xi']}). "
                "O nível de 10 anos é extrapolação além da série. Prefira a tabela de excedência acima.",
                "",
            ]
        else:
            L += ["", f"Anos completos insuficientes neste regime ({len(r['anos_usados_no_ajuste'])}) para ajustar Gumbel/GEV; **só a tabela de excedência** é informativa.", ""]
    return "\n".join(L)


def main():
    n = carregar()
    res = {"estatisticas_anuais": estatisticas_anuais(n), "regimes": {k: analisar_regime(n, k) for k in REGIMES}}
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "frequencia_mare.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    (SAIDA / "frequencia_mare.md").write_text(relatorio(res), encoding="utf-8")
    print(f"Gravado em {SAIDA}")


if __name__ == "__main__":
    main()
