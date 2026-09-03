"""Acesso privado aos bancos de referências hidráulicas do SAR."""

import logging
from typing import Any

import httpx


logger = logging.getLogger("sar.backend.hydraulic_references")

TUBE_TABLE = "sar_tec_hidraulica_tubulacoes"
EQUIVALENT_LENGTH_VIEW = "vw_hidraulica_comprimentos_equivalentes"

TUBE_FIELDS = ",".join(
    [
        "id",
        "codigo",
        "material",
        "norma_classe",
        "diametro_nominal",
        "diametro_externo_mm",
        "espessura_mm",
        "diametro_interno_mm",
        "area_interna_cm2",
        "area_externa_secao_cm2",
        "area_superficial_externa_m2_m",
        "volume_interno_l_m",
        "peso_vazio_kg_m",
        "peso_cheio_kg_m",
        "vazao_max_5ms_lpm",
        "fator_c_hazen",
        "ordem",
        "observacao",
        "fonte_url",
    ]
)

EQUIVALENT_LENGTH_FIELDS = ",".join(
    [
        "material",
        "dn_mm",
        "categoria",
        "conexao",
        "comprimento_equivalente_m",
        "ordem",
    ]
)


def _service_headers(admin_key: str) -> dict[str, str]:
    headers = {
        "apikey": admin_key,
        "Accept": "application/json",
    }
    # A chave secreta atual é opaca e viaja somente no cabeçalho apikey.
    # A service_role legada é JWT e precisa também de Authorization.
    if not admin_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {admin_key}"
    return headers


async def _load_records(
    client: httpx.AsyncClient,
    admin_key: str | None,
    *,
    source: str,
    params: dict[str, str],
    error_label: str,
) -> list[dict[str, Any]]:
    if not admin_key:
        raise RuntimeError(
            "O acesso privado ao banco hidráulico ainda não foi configurado."
        )

    try:
        response = await client.get(
            f"/rest/v1/{source}",
            headers=_service_headers(admin_key),
            params=params,
        )
    except httpx.HTTPError as error:
        raise RuntimeError(f"Não foi possível consultar {error_label}.") from error

    if response.status_code != 200:
        logger.error(
            "Supabase retornou %s ao consultar %s: %s",
            response.status_code,
            source,
            response.text[:500],
        )
        raise RuntimeError(f"Não foi possível consultar {error_label}.")

    try:
        rows = response.json()
    except ValueError as error:
        raise RuntimeError(f"{error_label.capitalize()} retornou dados inválidos.") from error

    if not isinstance(rows, list):
        raise RuntimeError(f"{error_label.capitalize()} retornou dados inválidos.")
    return [row for row in rows if isinstance(row, dict)]


async def load_tube_records(
    client: httpx.AsyncClient,
    admin_key: str | None,
) -> list[dict[str, Any]]:
    return await _load_records(
        client,
        admin_key,
        source=TUBE_TABLE,
        params={
            "ativo": "eq.true",
            "select": TUBE_FIELDS,
            "order": "ordem.asc,material.asc,norma_classe.asc",
            "limit": "2000",
        },
        error_label="o banco de tubulações",
    )


async def load_equivalent_length_records(
    client: httpx.AsyncClient,
    admin_key: str | None,
) -> list[dict[str, Any]]:
    return await _load_records(
        client,
        admin_key,
        source=EQUIVALENT_LENGTH_VIEW,
        params={
            "select": EQUIVALENT_LENGTH_FIELDS,
            "order": "material.asc,dn_mm.asc,ordem.asc",
            "limit": "5000",
        },
        error_label="o banco de comprimentos equivalentes",
    )
