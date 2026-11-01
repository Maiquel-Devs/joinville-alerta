# backend/cache_store.py
# Cache em RAM. Guarda o último resultado VÁLIDO.
from config import VALIDADE_MIN

_ultimo: dict | None = None


def guardar(resultado: dict) -> None:
    global _ultimo
    _ultimo = resultado


def status_geral() -> dict:
    """Cache vazio => indisponivel, nunca "normal"."""
    if _ultimo is None:
        return {
            "status": "indisponivel",
            "gerado_em": None,
            "validade_min": VALIDADE_MIN,
            "mare_efetiva_m": None,
            "mare_origem": None,
            "chuva_24h_mm": None,
            "faixas": {},
            "atencao_geral": {"chuva": None, "mare": None},
            "nivel": "indisponivel",
            "texto": None,
        }
    return _ultimo
