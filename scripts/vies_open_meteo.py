#!/usr/bin/env python3
"""Open-Meteo × sensores de chuva das estações (tarefa 6.2).

OFFLINE, no computador do autor, com internet. Baixa a chuva horária do ponto de
`backend/config.py` na Historical Forecast API da Open-Meteo (guarda o JSON em `data/raw/open_meteo/`,
fora do git) e compara com as estações do joinville_meteo. Grava `data/derivados/vies_open_meteo.{md,json}`.
Só PROPÕE uma correção; não aplica nada.

Por que a Historical Forecast API e não a Archive: o back-end usa o endpoint `forecast` (modelo "best match"
de previsão, com `past_days`). A Historical Forecast API guarda o que esse mesmo endpoint teria devolvido,
então mede o viés do que roda em produção. A Archive é reanálise (ERA5), um produto diferente.
Limite: a Historical Forecast API só tem dado de chuva a partir de 2018 (testado: 2016 vem nulo).

Fonte das estações: Dos Santos-Silva, J. C. (2026), DOI 10.5281/zenodo.21682712, CC BY 4.0.

Uso:  python scripts/vies_open_meteo.py
"""
import ast
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chuva_serie import ESTACOES, RAIZ, carregar_chuva, chuva_24h, eventos  # noqa: E402
from frequencia_chuva import CURVA, LIMIARES, TR, ajuste, maximos_anuais, taxas  # noqa: E402

SAIDA = RAIZ / "data" / "derivados"
CACHE = RAIZ / "data" / "raw" / "open_meteo"
URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
INICIO = "2018-01-01"
QUANTIS = [0.5, 0.9, 0.95, 0.99, 0.999]
ANO_COBERTURA_MIN = 0.5  # no comparável, aceita-se ano com metade das janelas em comum (a série em comum é curta)


def ponto_do_backend() -> tuple[float, float]:
    """Lê LATITUDE/LONGITUDE de backend/config.py sem importar o módulo (que não tem efeito colateral, mas fica isolado)."""
    consts = {}
    for no in ast.parse((RAIZ / "backend" / "config.py").read_text(encoding="utf-8")).body:
        if isinstance(no, ast.Assign) and isinstance(no.targets[0], ast.Name) and no.targets[0].id in ("LATITUDE", "LONGITUDE"):
            consts[no.targets[0].id] = ast.literal_eval(no.value)
    return consts["LATITUDE"], consts["LONGITUDE"]


def baixar(lat: float, lon: float, fim: str) -> pd.Series:
    CACHE.mkdir(parents=True, exist_ok=True)
    pedacos = []
    for ano in range(int(INICIO[:4]), int(fim[:4]) + 1):
        a, b = f"{ano}-01-01", min(f"{ano}-12-31", fim)
        arq = CACHE / f"hist_forecast_{ano}_{b}.json"
        if not arq.exists():
            q = urllib.parse.urlencode(
                {"latitude": lat, "longitude": lon, "start_date": a, "end_date": b, "hourly": "precipitation", "timezone": "Etc/GMT+3"}
            )
            for n in range(1, 6):
                try:
                    req = urllib.request.Request(f"{URL}?{q}", headers={"User-Agent": "JoinvilleAlerta/2.0 (projeto academico Univille)"})
                    arq.write_bytes(urllib.request.urlopen(req, timeout=60).read())
                    break
                except (urllib.error.URLError, TimeoutError) as e:
                    print(f"  tentativa {n} falhou para {ano}: {e}")
                    time.sleep(5 * n)
            else:
                sys.exit(f"Não consegui baixar {ano}")
            time.sleep(1)
        d = json.loads(arq.read_text(encoding="utf-8"))
        pedacos.append(pd.Series(d["hourly"]["precipitation"], index=pd.to_datetime(d["hourly"]["time"]), dtype=float))
        grade = (d["latitude"], d["longitude"], d.get("elevation"))
    s = pd.concat(pedacos)
    return s[~s.index.duplicated()].sort_index(), grade


def ev(s24, lim):
    return len(eventos(s24, lim))


def comparar(cod: str, om: pd.Series) -> dict:
    obs, _ = carregar_chuva(cod)
    idx = obs.index.intersection(om.index)
    o1, m1 = obs.reindex(idx), om.reindex(idx)

    # alinhamento horário: correlação da chuva de 1 h com a Open-Meteo deslocada de k horas
    ok = o1.notna() & m1.notna()
    lags = {}
    for k in (-2, -1, 0, 1, 2):
        mk = om.shift(k).reindex(idx)
        j = o1.notna() & mk.notna()
        lags[k] = round(float(np.corrcoef(o1[j], mk[j])[0, 1]), 3)

    o24, m24 = chuva_24h(o1), chuva_24h(m1)
    comum = o24.notna() & m24.notna()
    o24c, m24c = o24.where(comum), m24.where(comum)
    anos_comuns = float(comum.sum()) / 8766.0
    n = int(comum.sum())

    res = {
        "nome": ESTACOES[cod][0],
        "periodo_comum": [str(o24c.dropna().index.min())[:10], str(o24c.dropna().index.max())[:10]],
        "anos_com_janela_em_comum": round(anos_comuns, 2),
        "horas_com_dado_em_comum_1h": int(ok.sum()),
        "correlacao_1h_por_deslocamento_h": lags,
        "chuva_total_mm": {"estacao": round(float(o1[ok].sum()), 0), "open_meteo": round(float(m1[ok].sum()), 0)},
    }
    res["razao_total_om_sobre_estacao"] = round(res["chuva_total_mm"]["open_meteo"] / res["chuva_total_mm"]["estacao"], 3)

    d = (m24c - o24c).dropna()
    res["janela_24h"] = {
        "n_horas": n,
        "vies_medio_mm": round(float(d.mean()), 2),
        "rmse_mm": round(float(np.sqrt((d**2).mean())), 2),
        "correlacao_pearson": round(float(np.corrcoef(o24c.dropna(), m24c.dropna())[0, 1]), 3),
        "correlacao_spearman": round(float(o24c.dropna().rank().corr(m24c.dropna().rank())), 3),
    }
    # quantis de cada série e razão
    res["quantis_24h_mm"] = {
        f"p{q * 100:g}": {
            "estacao": round(float(o24c.quantile(q)), 1),
            "open_meteo": round(float(m24c.quantile(q)), 1),
            "razao_om_sobre_estacao": round(float(m24c.quantile(q) / o24c.quantile(q)), 2) if o24c.quantile(q) > 0 else None,
        }
        for q in QUANTIS
    }
    # eventos por ano nos mesmos limiares, só nas horas em comum
    res["eventos_ano"] = {
        lim: {"estacao": round(ev(o24c, lim) / anos_comuns, 2), "open_meteo": round(ev(m24c, lim) / anos_comuns, 2)} for lim in LIMIARES
    }
    # limiar da Open-Meteo que reproduz a taxa de eventos da estação (casamento por frequência)
    cas = {}
    for lim in LIMIARES:
        alvo = ev(o24c, lim)
        if alvo == 0:
            continue
        cand = [(abs(ev(m24c, x) - alvo), x) for x in np.arange(5, 200, 1.0)]
        cas[lim] = float(min(cand)[1])
    res["limiar_open_meteo_com_mesma_taxa_da_estacao_mm"] = cas

    # acerto de eventos (janela de 24 h): estação acima do limiar → Open-Meteo também em ±24 h
    acerto = {}
    for lim in (30, 50, 80):
        ie, im = eventos(o24c, lim), eventos(m24c, lim)
        if len(ie) == 0:
            continue
        pega = sum(1 for t in ie if len(im) and np.abs((im - t) / pd.Timedelta("1h")).min() <= 24)
        falso = sum(1 for t in im if len(ie) == 0 or np.abs((ie - t) / pd.Timedelta("1h")).min() > 24)
        acerto[lim] = {"eventos_estacao": len(ie), "detectados_pela_om": pega, "eventos_om": len(im), "eventos_om_sem_par_na_estacao": falso}
    res["acerto_de_eventos_24h"] = acerto

    # máximos anuais, ano com cobertura em comum >= metade
    cob = comum.groupby(comum.index.year).mean()
    mo = o24c.groupby(o24c.index.year).max()
    mm = m24c.groupby(m24c.index.year).max()
    res["maximo_anual_24h_mm"] = {
        int(a): {"estacao": round(float(mo[a]), 1), "open_meteo": round(float(mm[a]), 1), "cobertura": round(float(cob[a]), 2)}
        for a in cob.index
        if cob[a] >= ANO_COBERTURA_MIN and np.isfinite(mo[a])
    }
    # proposta (NÃO aplicada): mapeamento por quantis da cauda e fator simples
    q_top = [0.9, 0.95, 0.99, 0.999]
    res["proposta_correcao"] = {
        "fator_simples_total": res["razao_total_om_sobre_estacao"],
        "mapeamento_quantis_om_para_estacao_mm": {
            f"{round(float(m24c.quantile(q)), 1)}": round(float(o24c.quantile(q)), 1) for q in q_top
        },
    }
    return res


def relatorio(res: dict, om_info: dict, lat: float, lon: float, grade) -> str:
    L = [
        "# Open-Meteo × estações de chuva — viés (derivado)",
        "",
        "Gerado por `scripts/vies_open_meteo.py` (tarefa 6.2). **Resultado derivado**; os dados brutos (estações e JSON da Open-Meteo) não estão no repositório.",
        "",
        "**Fonte das estações:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). "
        "Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. CC BY 4.0. **Open-Meteo:** dados de previsão histórica, CC BY 4.0 (open-meteo.com).",
        "",
        "## Método",
        "",
        f"- **Ponto:** `LATITUDE`/`LONGITUDE` de `backend/config.py` ({lat}; {lon}). A Open-Meteo encaixa no ponto de grade ({grade[0]:.4f}; {grade[1]:.4f}), elevação {grade[2]} m.",
        "- **API usada:** *Historical Forecast API* (`historical-forecast-api.open-meteo.com`), variável `precipitation` horária, fuso fixo UTC-3 (igual ao das estações). "
        "Motivo: é o que o endpoint `forecast` usado pelo back-end teria devolvido. A *Archive API* (reanálise ERA5) é outro produto e foi **descartada**. "
        f"Limite: a Historical Forecast só tem chuva a partir de 2018 (2016 volta nulo); período baixado: {INICIO} a {om_info['fim']}.",
        "- **Comparação:** mesma chuva móvel de 24 h do `frequencia_chuva.py`, só nas horas em que **ambas** têm janela válida. QC das estações como no relatório de frequência.",
        "- **Estações:** sensores de chuva de Iate Clube, Flotflux e Águas de Joinville. Os três ficam a 2 a 7 km do ponto; a diferença espacial entra no 'viés' e não dá para separá-la do erro do modelo.",
        "- **Correção:** apenas proposta, **não aplicada** em nenhum lugar do código.",
        "",
    ]
    for cod, r in res.items():
        j = r["janela_24h"]
        L += [
            f"## {r['nome']}",
            "",
            f"Período em comum: {r['periodo_comum'][0]} a {r['periodo_comum'][1]}; **{r['anos_com_janela_em_comum']} anos** de janela de 24 h válida nos dois.",
            "",
            f"- **Total de chuva (horas em comum):** estação {r['chuva_total_mm']['estacao']:.0f} mm; Open-Meteo {r['chuva_total_mm']['open_meteo']:.0f} mm; razão **{r['razao_total_om_sobre_estacao']}**.",
            f"- **Janela de 24 h:** viés médio {j['vies_medio_mm']} mm (Open-Meteo − estação); RMSE {j['rmse_mm']} mm; correlação de Pearson {j['correlacao_pearson']}, de Spearman {j['correlacao_spearman']}.",
            f"- **Alinhamento horário** (correlação da chuva de 1 h com a Open-Meteo deslocada de k h): " + "; ".join(f"k={k}: {v}" for k, v in r["correlacao_1h_por_deslocamento_h"].items()) + ".",
            "",
            "### Quantis da chuva de 24 h (mm)",
            "",
            "| Quantil | Estação | Open-Meteo | Razão OM/estação |",
            "|--|--:|--:|--:|",
        ]
        for q, v in r["quantis_24h_mm"].items():
            razao = "—" if v["razao_om_sobre_estacao"] is None else v["razao_om_sobre_estacao"]  # mediana da estação é 0 mm
            L.append(f"| {q} | {v['estacao']} | {v['open_meteo']} | {razao} |")
        L += ["", "### Eventos por ano (horas em comum)", "", "| Limiar (mm) | Estação | Open-Meteo |", "|--:|--:|--:|"]
        for lim, v in r["eventos_ano"].items():
            L.append(f"| {lim} | {v['estacao']} | {v['open_meteo']} |")
        L += ["", "### Máximo anual da chuva de 24 h (anos com ≥ 50% de janelas em comum)", "", "| Ano | Estação | Open-Meteo | Cobertura |", "|--|--:|--:|--:|"]
        for a, v in r["maximo_anual_24h_mm"].items():
            L.append(f"| {a} | {v['estacao']} | {v['open_meteo']} | {int(v['cobertura'] * 100)}% |")
        if r["acerto_de_eventos_24h"]:
            L += ["", "### A Open-Meteo vê os eventos da estação? (par dentro de ±24 h)", "", "| Limiar (mm) | Eventos na estação | Detectados | Eventos na OM | OM sem par na estação |", "|--:|--:|--:|--:|--:|"]
            for lim, v in r["acerto_de_eventos_24h"].items():
                L.append(f"| {lim} | {v['eventos_estacao']} | {v['detectados_pela_om']} | {v['eventos_om']} | {v['eventos_om_sem_par_na_estacao']} |")
        L += [
            "",
            "### Proposta de correção (não aplicada)",
            "",
            f"- **Fator simples:** multiplicar a Open-Meteo por 1/{r['razao_total_om_sobre_estacao']} = {round(1 / r['razao_total_om_sobre_estacao'], 2)} (só corrige o total, não a cauda).",
            "- **Casamento por frequência:** limiar da Open-Meteo que produz a mesma taxa de eventos da estação no mesmo período: "
            + "; ".join(f"estação {k} mm ↔ Open-Meteo {v:g} mm" for k, v in r["limiar_open_meteo_com_mesma_taxa_da_estacao_mm"].items())
            + ".",
            "- **Mapeamento por quantis** (valor da Open-Meteo → valor equivalente da estação): "
            + "; ".join(f"{k} → {v}" for k, v in r["proposta_correcao"]["mapeamento_quantis_om_para_estacao_mm"].items())
            + ".",
            "",
        ]
    om = om_info
    L += [
        "## A própria Open-Meteo, série completa (o que o app veria em produção)",
        "",
        f"Período: {om['inicio']} a {om['fim']}; **{om['anos']} anos** de janela de 24 h válida (sem lacunas). Sem a restrição de comparar com a estação, esta é a série que o motor de produção enxerga.",
        "",
        "| Limiar (mm) | Eventos/ano | Dias/ano | Horas/ano |",
        "|--:|--:|--:|--:|",
    ]
    for lim, v in om["limiares_mm"].items():
        L.append(f"| {lim} | {v['eventos_ano']} | {v['dias_ano']} | {v['horas_ano']} |")
    L += ["", "Máximo anual (anos com ≥ 75% de janelas): " + ", ".join(f"{a}: {m}" for a, m in om["maximo_anual_usado"].items()) + ".", ""]
    if "gumbel" in om:
        L += ["Níveis de retorno da Open-Meteo (Gumbel, " + str(len(om["maximo_anual_usado"])) + " anos; **25 anos é extrapolação**): "
              + "; ".join(f"TR {t}: {om['gumbel'][t]['nivel_mm']} mm {om['gumbel'][t]['ic95_mm']}" for t in TR) + ".", ""]
    return "\n".join(L)


def main():
    lat, lon = ponto_do_backend()
    fim = min(max(carregar_chuva(c)[0].index.max() for c in ESTACOES), pd.Timestamp.now()).strftime("%Y-%m-%d")
    print(f"Baixando Open-Meteo {INICIO} a {fim} em ({lat}, {lon})")
    om, grade = baixar(lat, lon, fim)
    om = om.reindex(pd.date_range(om.index.min(), om.index.max(), freq="h"))
    print(f"  {om.notna().sum()} horas; nulas: {om.isna().sum()}")

    res = {c: comparar(c, om) for c in ESTACOES}

    o24 = chuva_24h(om)
    mx, cober = maximos_anuais(o24)
    usados = {int(a): round(float(mx[a]), 1) for a in mx.index if cober[a] >= 0.75}
    info = {
        "inicio": str(om.index.min())[:10],
        "fim": str(om.dropna().index.max())[:10],
        "anos": round(float(o24.notna().sum()) / 8766.0, 2),
        "limiares_mm": taxas(o24, LIMIARES),
        "curva_eventos_ano": {m: v["eventos_ano"] for m, v in taxas(o24, CURVA).items()},
        "maximo_anual_24h_mm": {int(a): round(float(mx[a]), 1) for a in mx.index},
        "maximo_anual_usado": usados,
        "ponto_de_grade": {"lat": grade[0], "lon": grade[1], "elevacao_m": grade[2]},
    }
    if len(usados) >= 6:
        info["gumbel"] = ajuste(np.array(list(usados.values())), "gumbel", np.random.default_rng(20261101))

    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "vies_open_meteo.json").write_text(json.dumps({"estacoes": res, "open_meteo_completo": info}, ensure_ascii=False, indent=1), encoding="utf-8")
    (SAIDA / "vies_open_meteo.md").write_text(relatorio(res, info, lat, lon, grade), encoding="utf-8")
    print(f"Gravado em {SAIDA}")


if __name__ == "__main__":
    main()
