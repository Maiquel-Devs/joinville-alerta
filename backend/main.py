# backend/main.py
import asyncio
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager

import rota_exposicao
import trajetos
from cache_store import status_geral
from config import CICLO_MIN
from scheduler import update_telemetry_job
from sources import agora

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Primeira coleta em segundo plano: a porta abre logo (Render) e, com o cache
    # vazio, o endpoint responde "indisponivel" até a coleta terminar.
    coleta_inicial = asyncio.create_task(update_telemetry_job())
    # Agenda a atualização a cada 15 minutos
    scheduler.add_job(update_telemetry_job, "interval", minutes=CICLO_MIN)
    scheduler.start()
    yield
    scheduler.shutdown()
    coleta_inicial.cancel()

app = FastAPI(title="joinville-alerta API", lifespan=lifespan)

# CORS restrito à origem do front (só esquema + host, sem caminho). Várias origens: separar por vírgula.
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "https://maiquel-devs.github.io")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGIN.split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/api/v1/status-geral")
async def get_status_geral():
    # Retorna o resultado direto da RAM (< 5ms)
    return status_geral()


@app.get("/api/v1/trajetos")
async def get_trajetos():
    # Lista do índice: trajetos fixos, sem destino livre.
    return trajetos.indice()


@app.get("/api/v1/trajetos/{id_}")
async def get_trajeto(id_: str):
    trajeto = trajetos.trajeto_por_id(id_)
    if trajeto is None:
        raise HTTPException(status_code=404, detail="Trajeto não encontrado")
    return trajetos.montar_trajeto(trajeto, status_geral())


@app.get("/api/v1/rota")
def get_rota(origem: str, destino: str, origem_no: int | None = None, destino_no: int | None = None):
    """Caminho mais curto e caminho de menor exposição às faixas do PDDU entre duas ruas.

    Métrica de exposição, não recomendação. Sem texto para o usuário: o front monta os textos.
    origem_no / destino_no (opcionais): nó escolhido pelo usuário entre as opções de um resultado
    "ambiguo". Sem eles, nome ambíguo devolve as opções e não calcula.

    Status do corpo (HTTP 200): "ok" (os dois caminhos), "ambiguo" (opções de um lado ou dos dois; não calcula),
    "nao_encontrado" (nenhuma rua da malha casa com o texto de um dos lados; não significa ausência de risco;
    cada lado traz "sugestoes": até 3 nomes oficiais parecidos, sem calcular nada),
    "indisponivel" (sem dado de maré e chuva válido) e "sem_caminho" (as ruas não se ligam na malha).
    HTTP 400: texto com menos de 3 letras ou nó inexistente; HTTP 503: grafo indisponível.
    """
    for campo, texto in (("origem", origem), ("destino", destino)):
        if rota_exposicao.consulta(texto) is None:
            raise HTTPException(status_code=400, detail={"campo": campo, "motivo": "curto"})
    try:
        rede = rota_exposicao.rede()
    except OSError:
        raise HTTPException(status_code=503, detail={"motivo": "grafo_indisponivel"})
    for campo, no in (("origem_no", origem_no), ("destino_no", destino_no)):
        if no is not None and no not in rede.g:
            raise HTTPException(status_code=400, detail={"campo": campo, "motivo": "no_inexistente"})

    lados = {}
    for campo, texto, no in (("origem", origem, origem_no), ("destino", destino, destino_no)):
        if no is not None:
            d = rede.g.nodes[no]
            lados[campo] = {"ambiguo": False, "total_opcoes": 1,
                            "opcoes": [{"nome": None, "rotulo": None, "trechos": None, "no": no, "lat": d["lat"], "lon": d["lon"]}]}
        else:
            lados[campo] = rota_exposicao.resolver(rede, texto)
    if any(lado["ambiguo"] for lado in lados.values()):
        return {"status": "ambiguo", **lados}
    if any(lado["total_opcoes"] == 0 for lado in lados.values()):
        for campo, texto in (("origem", origem), ("destino", destino)):  # sugestões só para o lado sem resultado
            lados[campo]["sugestoes"] = rota_exposicao.sugerir(rede, texto) if lados[campo]["total_opcoes"] == 0 else []
        return {"status": "nao_encontrado", **lados}

    estado = status_geral()
    ativas = rota_exposicao.faixas_ativas_validas(estado, agora())
    if ativas is None:
        return {"status": "indisponivel", "gerado_em": estado.get("gerado_em"), **lados}
    o, d = lados["origem"]["opcoes"][0], lados["destino"]["opcoes"][0]
    resultado = rota_exposicao.calcular(rede, o["no"], d["no"], ativas)
    return {**resultado, "gerado_em": estado.get("gerado_em"), "faixas_ativas": list(ativas),
            "origem": o, "destino": d}
