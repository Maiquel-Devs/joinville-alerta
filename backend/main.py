# backend/main.py
import asyncio
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager

import trajetos
from cache_store import status_geral
from config import CICLO_MIN
from scheduler import update_telemetry_job

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
