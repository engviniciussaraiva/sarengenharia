"""Rotas protegidas das bibliotecas de referências hidráulicas."""

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.security import CurrentUser, ensure_any_module_permission, require_active_user
from app.services.hydraulic_reference_repository import (
    load_equivalent_length_records,
    load_tube_records,
)


router = APIRouter(prefix="/api/hidraulica", tags=["referências hidráulicas"])

TUBES_RESOURCE_CODES = ("HIDRAULICA_REFERENCIAS_TABELA_TUBOS",)
EQUIVALENT_LENGTH_RESOURCE_CODES = (
    "HIDRAULICA_REFERENCIAS_PERDA_CARGA_CONEXOES",
    "HIDRAULICA_REFERENCIAS_TABELA_TUBOS",
)

TUBES_MOTOR_VERSION = "TUBULACOES-RAILWAY-V1"
EQUIVALENT_LENGTH_MOTOR_VERSION = "PERDA-CARGA-CONEXOES-RAILWAY-V1"


class HydraulicReferenceRequest(BaseModel):
    operacao: str
    dados: dict[str, Any] = Field(default_factory=dict)


async def _execute_listing(
    *,
    payload: HydraulicReferenceRequest,
    request: Request,
    current_user: CurrentUser,
    expected_operation: str,
    resource_codes: tuple[str, ...],
    loader: Callable[..., Awaitable[list[dict[str, Any]]]],
    motor_version: str,
) -> Any:
    operation = payload.operacao.strip().lower()
    if operation != expected_operation:
        return JSONResponse(
            status_code=400,
            content={"sucesso": False, "mensagem": "Operação hidráulica não reconhecida."},
        )

    await ensure_any_module_permission(
        request,
        current_user,
        resource_codes,
        "visualizar",
    )
    settings = get_settings()

    try:
        records = await loader(
            request.app.state.supabase_client,
            settings.supabase_admin_key,
        )
    except RuntimeError as error:
        return JSONResponse(
            status_code=503,
            content={"sucesso": False, "mensagem": str(error)},
        )

    return {
        "sucesso": True,
        "operacao": operation,
        "resultado": {"registros": records, "total": len(records)},
        "versao_motor": motor_version,
    }


@router.post("/tubulacoes", response_model=None)
async def list_tubes(
    payload: HydraulicReferenceRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_active_user),
) -> Any:
    return await _execute_listing(
        payload=payload,
        request=request,
        current_user=current_user,
        expected_operation="listar_tubulacoes",
        resource_codes=TUBES_RESOURCE_CODES,
        loader=load_tube_records,
        motor_version=TUBES_MOTOR_VERSION,
    )


@router.post("/perda-carga-conexoes", response_model=None)
async def list_equivalent_lengths(
    payload: HydraulicReferenceRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_active_user),
) -> Any:
    return await _execute_listing(
        payload=payload,
        request=request,
        current_user=current_user,
        expected_operation="listar_comprimentos_equivalentes",
        resource_codes=EQUIVALENT_LENGTH_RESOURCE_CODES,
        loader=load_equivalent_length_records,
        motor_version=EQUIVALENT_LENGTH_MOTOR_VERSION,
    )
