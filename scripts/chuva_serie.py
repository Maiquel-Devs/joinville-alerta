"""Leitura, QC e janela móvel de 24 h da chuva horária (joinville_meteo).

Módulo de apoio de `frequencia_chuva.py` e `vies_open_meteo.py`. OFFLINE.
Fonte: Dos Santos-Silva, J. C. (2026), DOI 10.5281/zenodo.21682712, CC BY 4.0.
"""
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "joinville_meteo_dados" / "joinville_meteo_dados"
ESTACOES = {
    "iateclube": ("Iate Clube", -26.2925, -48.7802),
    "flotflux": ("Flotflux (Cachoeira Central)", -26.2753, -48.8492),
    "aguasdejoi": ("Águas de Joinville (Bucarein)", -26.3218, -48.8381),
}

CHUVA_HORA_MAX_MM = 200.0  # acima do máximo físico razoável por hora (o máximo retido no conjunto é 94,5)
DESPEJO_MM = 40.0  # valor >= 40 mm na hora seguinte a uma lacuna > 2 h = balde acumulado, não chuva da hora
LACUNA_DESPEJO_H = 2
MES_MIN_HORAS = 500  # mês com pelo menos isso de horas registradas...
MES_ZERO_SUSPEITO = 5.0  # ...e até 5 mm no total = sensor parado (Joinville não tem mês assim seco; vários meses seguidos com 0 mm)


def carregar_chuva(cod: str, pasta: Path = ENTRADA) -> tuple[pd.Series, dict]:
    """Série horária de chuva (mm) numa grade regular; inválido = NaN, nunca 0.

    Devolve também a contagem de horas descartadas por motivo.
    """
    d = pd.read_csv(pasta / "series_horaria" / f"{cod}.csv.gz", parse_dates=["date"])
    p = d.set_index("date")["prec"].sort_index()
    p = p[~p.index.duplicated()]
    p = p.reindex(pd.date_range(p.index.min(), p.index.max(), freq="h"))
    n0 = int(p.notna().sum())
    qc = {"horas_com_chuva_bruta": n0}

    fora = (p < 0) | (p > CHUVA_HORA_MAX_MM)
    p[fora] = np.nan
    qc["fora_da_faixa"] = int(fora.sum())

    # despejo de acúmulo: valor grande logo depois de uma lacuna longa
    ausente = p.isna()
    corrida = ausente.groupby((~ausente).cumsum()).cumsum()  # horas ausentes seguidas até aqui
    despejo = (p >= DESPEJO_MM) & (corrida.shift(1, fill_value=0) > LACUNA_DESPEJO_H)
    p[despejo] = np.nan
    qc["despejo_apos_lacuna"] = int(despejo.sum())

    # meses de sensor parado (registro cheio e total zero)
    mes = p.groupby([p.index.year, p.index.month])
    parado = mes.transform(lambda g: g.count() >= MES_MIN_HORAS and g.sum() <= MES_ZERO_SUSPEITO)
    parado = parado.astype(bool)
    qc["horas_em_meses_parados"] = int((parado & p.notna()).sum())
    p[parado] = np.nan

    qc["horas_com_chuva_apos_qc"] = int(p.notna().sum())
    return p, qc


def chuva_24h(p: pd.Series) -> pd.Series:
    """Soma móvel das 24 h que terminam na hora, só com a janela completa (24 valores válidos)."""
    return p.rolling(24, min_periods=24).sum()


def eventos(serie24: pd.Series, limiar: float, separacao_h: int = 24) -> pd.DatetimeIndex:
    """Início de cada evento: trechos contíguos com a chuva de 24 h >= limiar,
    fundidos quando separados por menos de `separacao_h` horas abaixo do limiar.
    Horas sem dado não separam eventos (nem criam)."""
    acima = serie24 >= limiar
    idx = serie24.index[acima.to_numpy()]
    if len(idx) == 0:
        return idx
    quebra = np.diff(idx.values) > np.timedelta64(separacao_h, "h")
    return idx[np.concatenate([[True], quebra])]
