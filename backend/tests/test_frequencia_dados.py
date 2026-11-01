"""Tarefa 7.5: cada faixa de chuva acende com a frequência do alvo (CLAUDE.md, princípio 6).

Marcado `dados`: precisa da série horária da Open-Meteo em data/raw/open_meteo/ (fora do git).
Rodar com `cd backend && python -m pytest -m dados tests`. Não roda no CI.
"""
import json
import sys
from pathlib import Path

import pytest

pd = pytest.importorskip("pandas")

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "backend"))
sys.path.insert(0, str(RAIZ / "scripts"))

from chuva_serie import chuva_24h, eventos  # noqa: E402
from risk_engine import ATIVA, avaliar_atencao_geral, avaliar_faixas  # noqa: E402

pytestmark = pytest.mark.dados

CACHE = RAIZ / "data" / "raw" / "open_meteo"
TOLERANCIA = 0.5  # ±50% sobre o alvo

# alvo em eventos por ano (decisões de 29/10/2026 e 01/11/2026)
ALVOS = {
    "aviso_chuva": 3.0,
    "pluvial_vn_tr5": 0.2,
    "pluvial_vn_tr10": 0.1,
    "pluvial_vn_tr25": 0.04,
}


@pytest.fixture(scope="module")
def chuva24():
    arquivos = sorted(CACHE.glob("hist_forecast_*.json"))
    if not arquivos:
        pytest.skip("série da Open-Meteo ausente em data/raw/open_meteo/ (rode scripts/vies_open_meteo.py)")
    pedacos = []
    for a in arquivos:
        d = json.loads(a.read_text(encoding="utf-8"))
        pedacos.append(pd.Series(d["hourly"]["precipitation"], index=pd.to_datetime(d["hourly"]["time"]), dtype=float))
    s = pd.concat(pedacos)
    s = s[~s.index.duplicated()].sort_index()
    return chuva_24h(s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="h")))


@pytest.fixture(scope="module")
def taxas(chuva24):
    """Eventos por ano que o próprio motor acenderia, hora a hora."""
    valida = chuva24.dropna()
    anos = len(valida) / 8766.0
    ativo = {k: [] for k in ALVOS}
    for v in valida.to_numpy():
        faixas = avaliar_faixas(None, float(v))
        for f in ("pluvial_vn_tr5", "pluvial_vn_tr10", "pluvial_vn_tr25"):
            ativo[f].append(faixas[f] == ATIVA)
        ativo["aviso_chuva"].append(avaliar_atencao_geral(float(v))["chuva"] is True)
    out = {}
    for k, marcas in ativo.items():
        mascara = pd.Series(marcas, index=valida.index).astype(float)
        out[k] = len(eventos(mascara, 0.5)) / anos
    out["_anos"] = anos
    return out


def test_serie_tem_anos_suficientes(taxas):
    assert taxas["_anos"] > 5


@pytest.mark.parametrize("faixa", list(ALVOS))
def test_faixa_acende_perto_do_alvo(taxas, faixa):
    alvo, anos = ALVOS[faixa], taxas["_anos"]
    obtido = taxas[faixa]
    msg = f"{faixa}: {obtido:.3f} eventos/ano, alvo {alvo} (série de {anos:.1f} anos)"
    if 1 / anos <= 2 * TOLERANCIA * alvo:
        # a série resolve o alvo: cada evento a mais move a taxa menos que a faixa de ±50%
        assert alvo * (1 - TOLERANCIA) <= obtido <= alvo * (1 + TOLERANCIA), msg
    else:
        # alvo mais raro que a resolução da série (1 evento = 1/anos por ano, mais que a faixa de ±50%):
        # a faixa é inalcançável. Exige só que o nº de eventos seja plausível (Poisson, 95%) para o alvo.
        stats = pytest.importorskip("scipy.stats")
        n = round(obtido * anos)
        assert n <= stats.poisson.ppf(0.95, alvo * anos), msg + " (série curta: teste de plausibilidade)"
