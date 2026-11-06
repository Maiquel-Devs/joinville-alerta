"""Launcher de TESTE local: chuva e maré simuladas. Não versionar."""
import os

CHUVA_SIM_MM = float(os.environ.get("CHUVA_SIM_MM", "8.7"))
_mare = os.environ.get("MARE_SIM_M", "0.4").strip()
MARE_SIM_M = None if _mare == "" or _mare.lower() == "none" else float(_mare)


async def chuva_falsa(client, tentativas=3):
    return {"chuva_24h_mm": CHUVA_SIM_MM, "chuva_48h_mm": None}


async def mare_falsa(client, ref):
    if MARE_SIM_M is None:
        return None
    return {
        "mare_efetiva_m": MARE_SIM_M,
        "mare_origem": "medida",
        "mare_referencia_em": ref.isoformat(),
    }


import scheduler  # noqa: E402

scheduler.buscar_chuva = chuva_falsa
scheduler.buscar_mare = mare_falsa

import risk_engine  # noqa: E402


def _limiar(var, atual):
    v = os.environ.get(var, "").strip()
    return float(v) if v else atual


risk_engine.MARE_1_6_M = _limiar("LIMIAR_MARE_1_6_SIM_M", risk_engine.MARE_1_6_M)
risk_engine.MARE_2_5_M = _limiar("LIMIAR_MARE_2_5_SIM_M", risk_engine.MARE_2_5_M)
print(
    f"[TESTE] limiares de maré: {risk_engine.MARE_1_6_M:.2f} m e "
    f"{risk_engine.MARE_2_5_M:.2f} m".replace(".", ",")
)

from main import app  # noqa: E402
import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
