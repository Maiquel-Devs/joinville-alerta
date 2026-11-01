#!/usr/bin/env python3
"""Frequência de chuva (tarefa 6.1): eventos por ano acima de cada limiar e níveis de retorno.

OFFLINE, no computador do autor. Lê `joinville_meteo_dados/` (fora do git) e grava só
derivados em `data/derivados/frequencia_chuva.{md,json}`.

Fonte: Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa
Civil de Joinville). Zenodo, DOI 10.5281/zenodo.21682712, versão data-2026-07-29, CC BY 4.0.

Uso:  python scripts/frequencia_chuva.py
"""
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chuva_serie import ESTACOES, RAIZ, carregar_chuva, chuva_24h, eventos  # noqa: E402

warnings.filterwarnings("ignore", category=RuntimeWarning)  # ajustes GEV que divergem no bootstrap são esperados e viram "instável"
SAIDA = RAIZ / "data" / "derivados"
LIMIARES = [20, 30, 40, 50, 60, 80, 100]
CURVA = list(range(10, 251))  # grade densa de limiares (mm) para interpolar alvos no ativacoes.md
TR = [2, 5, 10, 25]
ANO_COBERTURA_MIN = 0.75  # ano entra no máximo anual se >= 75% das janelas de 24 h forem válidas
N_BOOT = 2000
SEMENTE = 20261101
H_ANO = 8766.0


def taxas(s24: pd.Series, limiares) -> dict:
    """Eventos/ano, dias/ano e horas/ano por limiar, normalizados pelo tempo com janela válida."""
    anos_obs = float(s24.notna().sum()) / H_ANO
    out = {}
    for lim in limiares:
        acima = s24 >= lim
        dias = acima[acima].index.normalize().nunique()
        out[lim] = {
            "eventos_ano": round(len(eventos(s24, lim)) / anos_obs, 3),
            "dias_ano": round(dias / anos_obs, 3),
            "horas_ano": round(float(acima.sum()) / anos_obs, 1),
            "eventos_total": int(len(eventos(s24, lim))),
        }
    return out


def maximos_anuais(s24: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Máximo anual da chuva de 24 h e cobertura (fração de janelas válidas) do ano."""
    cober = s24.groupby(s24.index.year).apply(lambda g: g.notna().mean())
    mx = s24.groupby(s24.index.year).max()
    return mx, cober


def nivel_retorno(amostra: np.ndarray, modelo: str, tr: list[int]) -> list[float]:
    if modelo == "gumbel":
        loc, escala = stats.gumbel_r.fit(amostra)
        return [float(stats.gumbel_r.ppf(1 - 1 / t, loc, escala)) for t in tr]
    c, loc, escala = stats.genextreme.fit(amostra)
    return [float(stats.genextreme.ppf(1 - 1 / t, c, loc, escala)) for t in tr]


def ajuste(amostra: np.ndarray, modelo: str, rng: np.random.Generator, casas: int = 1) -> dict:
    est = nivel_retorno(amostra, modelo, TR)
    boot = np.full((N_BOOT, len(TR)), np.nan)
    for i in range(N_BOOT):
        try:
            boot[i] = nivel_retorno(rng.choice(amostra, size=len(amostra), replace=True), modelo, TR)
        except Exception:
            pass
    res = {}
    for k, t in enumerate(TR):
        col = boot[:, k][np.isfinite(boot[:, k])]
        res[t] = {
            "nivel_mm": round(est[k], casas),  # unidade da amostra (mm na chuva; frequencia_mare.py renomeia)
            "ic95_mm": [round(float(np.percentile(col, 2.5)), casas), round(float(np.percentile(col, 97.5)), casas)] if len(col) > 100 else None,
        }
    if modelo == "gev":
        c = stats.genextreme.fit(amostra)[0]
        res["forma_xi"] = round(float(-c), 3)  # convenção usual: xi = -c do scipy
    return res


def analisar(cod: str) -> dict:
    p, qc = carregar_chuva(cod)
    s24 = chuva_24h(p)
    mx, cober = maximos_anuais(s24)
    anos_ok = [int(a) for a in mx.index if cober[a] >= ANO_COBERTURA_MIN and np.isfinite(mx[a])]
    amostra = np.array([mx[a] for a in anos_ok])
    rng = np.random.default_rng(SEMENTE)
    res = {
        "nome": ESTACOES[cod][0],
        "periodo": [str(p.index.min())[:10], str(p.index.max())[:10]],
        "qc": qc,
        "anos_de_observacao_com_janela_valida": round(float(s24.notna().sum()) / H_ANO, 2),
        "limiares_mm": taxas(s24, LIMIARES),
        "curva_eventos_ano": {m: v["eventos_ano"] for m, v in taxas(s24, CURVA).items()},
        "maximo_anual_24h_mm": {int(a): round(float(mx[a]), 1) for a in mx.index if np.isfinite(mx[a])},
        "cobertura_anual": {int(a): round(float(cober[a]), 2) for a in cober.index},
        "anos_usados_no_ajuste": anos_ok,
        "n_anos_ajuste": len(anos_ok),
    }
    if len(anos_ok) >= 6:
        res["gumbel"] = ajuste(amostra, "gumbel", rng)
        res["gev"] = ajuste(amostra, "gev", rng)
    return res


GEV_INSTAVEL_MM = 400  # chuva de 24 h acima disso em Joinville não é plausível: ajuste divergiu


def fmt_gev(x: float) -> str:
    return "instável" if x > GEV_INSTAVEL_MM else str(x)


def fmt_ic(ic) -> str:
    if ic is None:
        return "—"
    return "[" + ", ".join("instável" if v > GEV_INSTAVEL_MM else str(v) for v in ic) + "]"


def relatorio(res: dict) -> str:
    L = [
        "# Frequência de chuva — joinville_meteo (derivado)",
        "",
        "Gerado por `scripts/frequencia_chuva.py` (tarefa 6.1). **Resultado derivado**; os dados brutos não estão no repositório.",
        "",
        "**Fonte:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). "
        "Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. Licença CC BY 4.0. Termos da SEPROT ainda sem confirmação formal.",
        "",
        "## Método",
        "",
        "- **Dado:** chuva horária (`prec`) do sensor de chuva das três estações hidrometeorológicas de `series_horaria/` "
        "(Iate Clube, Flotflux, Águas de Joinville). Não é a rede de pluviômetros; ver a ressalva na tarefa 6.3.",
        "- **QC:** inválido vira ausente, nunca zero. Descarta hora fora de [0; 200] mm, despejo de acúmulo (≥ 40 mm na hora "
        "logo após lacuna > 2 h) e meses com registro cheio (≥ 500 h) e total ≤ 5 mm (sensor parado: aparecem muitos meses seguidos com 0 mm). O conjunto já traz um filtro anterior.",
        "- **Chuva móvel de 24 h:** soma das 24 h que terminam na hora; só com as 24 horas válidas (mesma janela de `somar_chuva` do back-end).",
        "- **Evento:** trecho em que a chuva de 24 h fica ≥ limiar; trechos separados por menos de 24 h abaixo do limiar contam como um evento. "
        "**Dia:** dia civil em que a chuva de 24 h chegou ao limiar em algum momento. Taxas divididas pelos anos de janela válida.",
        f"- **Máximo anual:** calendário civil; o ano entra no ajuste se ≥ {int(ANO_COBERTURA_MIN * 100)}% das janelas forem válidas "
        "(ano com lacuna grande subestima o máximo).",
        f"- **Níveis de retorno:** Gumbel e GEV (`scipy.stats`, máxima verossimilhança) sobre os máximos anuais; IC 95% por bootstrap ({N_BOOT} reamostragens).",
        "",
        "> **Atenção:** a série tem poucos anos. **O nível de 25 anos é extrapolação** (a série não chega a 25 anos). "
        "O de 10 anos também é pouco sustentado. O GEV com tão poucos máximos tem forma instável; os intervalos de confiança são largos de propósito.",
        "",
    ]
    for cod, r in res.items():
        L += [
            f"## {r['nome']}",
            "",
            f"Período: {r['periodo'][0]} a {r['periodo'][1]}; **{r['anos_de_observacao_com_janela_valida']} anos** com janela de 24 h válida; "
            f"**{r['n_anos_ajuste']} ano(s)** no ajuste ({', '.join(map(str, r['anos_usados_no_ajuste']))}).",
            "",
            "QC (horas): " + "; ".join(f"{k.replace('_', ' ')} = {v}" for k, v in r["qc"].items()) + ".",
            "",
            "### Eventos por ano acima de cada limiar (chuva de 24 h)",
            "",
            "| Limiar (mm) | Eventos/ano | Dias/ano | Horas/ano | Eventos na série |",
            "|--:|--:|--:|--:|--:|",
        ]
        for lim, v in r["limiares_mm"].items():
            L.append(f"| {lim} | {v['eventos_ano']} | {v['dias_ano']} | {v['horas_ano']} | {v['eventos_total']} |")
        L += ["", "### Máximo anual da chuva de 24 h", "", "| Ano | Máx. 24 h (mm) | Janelas válidas | No ajuste |", "|--|--:|--:|:-:|"]
        for a, m in r["maximo_anual_24h_mm"].items():
            L.append(f"| {a} | {m} | {int(r['cobertura_anual'][a] * 100)}% | {'sim' if int(a) in r['anos_usados_no_ajuste'] else 'não'} |")
        if "gumbel" in r:
            L += ["", "### Níveis de retorno (chuva de 24 h, mm)", "", "| TR (anos) | Gumbel | IC 95% Gumbel | GEV | IC 95% GEV | Obs. |", "|--:|--:|--|--:|--|--|"]
            for t in TR:
                g, v = r["gumbel"][t], r["gev"][t]
                obs = "extrapolação" if t >= 25 else ("pouco sustentado" if t >= 10 else "")
                L.append(f"| {t} | {g['nivel_mm']} | {fmt_ic(g['ic95_mm'])} | {fmt_gev(v['nivel_mm'])} | {fmt_ic(v['ic95_mm'])} | {obs} |")
            L += [
                "",
                f"Forma do GEV (ξ, positivo = cauda pesada): {r['gev']['forma_xi']}. "
                f"Com {r['n_anos_ajuste']} máximos anuais o GEV é instável (valores acima de {GEV_INSTAVEL_MM} mm aparecem como \"instável\"); "
                "**use o Gumbel e a curva de eventos por ano como referência**, e o GEV só como checagem.",
                "",
            ]
        else:
            L += ["", "Anos de máximo insuficientes (< 6) para o ajuste.", ""]
    return "\n".join(L)


def main():
    res = {c: analisar(c) for c in ESTACOES}
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "frequencia_chuva.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    (SAIDA / "frequencia_chuva.md").write_text(relatorio(res), encoding="utf-8")
    print(f"Gravado em {SAIDA}")


if __name__ == "__main__":
    main()
