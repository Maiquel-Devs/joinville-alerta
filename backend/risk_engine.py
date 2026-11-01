# backend/risk_engine.py
# Única regra de risco do sistema. Função pura: sem rede, sem relógio.
from config import (
    FAIXAS,
    LIMIAR_AVISO_CHUVA_24H_MM,
    LIMIAR_CHUVA_DA_FAIXA,
    MARE_1_6_M,
    MARE_2_5_M,
    NIVEIS,
    NIVEL_DA_FAIXA,
)

ATIVA = "ativa"
INATIVA = "inativa"
INDISPONIVEL = "indisponivel"


def _acima(valor: float | None, limiar: float) -> str:
    if valor is None:
        return INDISPONIVEL
    return ATIVA if valor >= limiar else INATIVA


def avaliar_faixas(mare_efetiva_m: float | None, chuva_24h_mm: float | None) -> dict[str, str]:
    faixas = {
        "mare_1_6": _acima(mare_efetiva_m, MARE_1_6_M),
        "mare_2_5": _acima(mare_efetiva_m, MARE_2_5_M),
    }
    for faixa, limiar in LIMIAR_CHUVA_DA_FAIXA.items():
        faixas[faixa] = _acima(chuva_24h_mm, limiar)
    return faixas


def avaliar_atencao_geral(chuva_24h_mm: float | None) -> dict[str, bool | None]:
    """Avisos gerais: não pintam ruas. None = sem dado. Maré sem gatilho até a tarefa 6.5."""
    chuva = None if chuva_24h_mm is None else chuva_24h_mm >= LIMIAR_AVISO_CHUVA_24H_MM
    return {"chuva": chuva, "mare": None}


def nivel_global(faixas: dict[str, str], atencao_geral: dict | None = None) -> str:
    """Pior faixa de rua ativa; senão atenção geral; "nenhum" só se TODAS as faixas têm dado."""
    ativas = [NIVEIS.index(NIVEL_DA_FAIXA[f]) for f in FAIXAS if faixas[f] == ATIVA]
    if ativas:
        return NIVEIS[max(ativas)]
    if atencao_geral and (atencao_geral.get("chuva") or atencao_geral.get("mare")):
        return "atencao_geral"
    if any(faixas[f] == INDISPONIVEL for f in FAIXAS):
        return INDISPONIVEL
    return "nenhum"


def faixas_ativas(faixas: dict[str, str]) -> tuple[str, ...]:
    return tuple(f for f in FAIXAS if faixas[f] == ATIVA)
