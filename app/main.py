from contextlib import asynccontextmanager
import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import account, fator_k, hydraulic_references, status


settings = get_settings()
logger = logging.getLogger("sar.backend")


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.supabase_client = httpx.AsyncClient(
        base_url=settings.supabase_url,
        timeout=httpx.Timeout(settings.supabase_timeout_seconds),
        follow_redirects=False,
        trust_env=False,
    )
    try:
        yield
    finally:
        await application.state.supabase_client.aclose()


app = FastAPI(
    title="SAR Backend",
    description="Motor privado Python do SAR Engenharia",
    version="0.4.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def unexpected_error(request: Request, error: Exception):
    logger.exception(
        "Erro não tratado em %s %s",
        request.method,
        request.url.path,
        exc_info=error,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno do servidor."},
        headers={"Cache-Control": "no-store"},
    )


app.include_router(status.router)
app.include_router(account.router)
app.include_router(fator_k.router)
app.include_router(hydraulic_references.router)
