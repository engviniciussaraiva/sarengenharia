import importlib
import os

import httpx
from fastapi.testclient import TestClient


os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("ENABLE_DOCS", "false")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
os.environ.setdefault("SUPABASE_SECRET_KEY", "sb_secret_test")
os.environ.setdefault(
    "ALLOWED_ORIGINS",
    "https://sarengenharia.com.br,https://sarengenharia.vercel.app",
)

main_module = importlib.import_module("app.main")
app = main_module.app


def supabase_transport(request: httpx.Request) -> httpx.Response:
    token = request.headers.get("authorization", "")
    if (
        request.headers.get("apikey") == "sb_secret_test"
        and request.url.path == "/rest/v1/sar_tec_hidraulica_tubulacoes"
    ):
        assert token == ""
        return httpx.Response(
            200,
            json=[
                {
                    "id": 21,
                    "codigo": "ACO-SCH40-DN50",
                    "material": "Aço carbono",
                    "norma_classe": "Sch 40",
                    "diametro_nominal": "DN 50",
                    "diametro_externo_mm": 60.3,
                    "espessura_mm": 3.91,
                    "diametro_interno_mm": 52.48,
                    "area_interna_cm2": 21.64,
                    "area_externa_secao_cm2": 6.93,
                    "area_superficial_externa_m2_m": 0.189,
                    "volume_interno_l_m": 2.164,
                    "peso_vazio_kg_m": 5.44,
                    "peso_cheio_kg_m": 7.60,
                    "vazao_max_5ms_lpm": 649.2,
                    "fator_c_hazen": 120,
                    "ordem": 1,
                    "observacao": None,
                    "fonte_url": None,
                }
            ],
        )
    if (
        request.headers.get("apikey") == "sb_secret_test"
        and request.url.path == "/rest/v1/vw_hidraulica_comprimentos_equivalentes"
    ):
        assert token == ""
        return httpx.Response(
            200,
            json=[
                {
                    "material": "Aço",
                    "dn_mm": 50,
                    "categoria": "Curva",
                    "conexao": "Curva 90°",
                    "comprimento_equivalente_m": 1.1,
                    "ordem": 1,
                }
            ],
        )
    if (
        request.headers.get("apikey") == "sb_secret_test"
        and request.url.path == "/rest/v1/sar_tec_hidraulica_equipamentos"
    ):
        return httpx.Response(
            200,
            json=[
                {
                    "id": 5,
                    "codigo": "SPK-TESTE",
                    "categoria": "Sprinkler",
                    "nome_equipamento": "Sprinkler teste",
                    "tipo_equipamento": "sprinkler",
                    "aplicacao": "Controle",
                    "fabricante": "SAR",
                    "modelo": "T-01",
                    "diametro_nominal": "15",
                    "conexao": "Rosca",
                    "forma_dimensionamento": "fator_k",
                    "fator_k_lmin_bar": 80,
                    "fator_k_lmin_mca": 25.052,
                    "fator_k_gpm_psi": 5.55,
                    "pressao_min_bar": 0.5,
                    "pressao_nominal_bar": 1,
                    "pressao_max_bar": 12,
                    "vazao_min_lpm": None,
                    "vazao_nominal_lpm": None,
                    "vazao_max_lpm": None,
                    "area_cobertura_m2": 12,
                    "angulo_cobertura_graus": 360,
                    "referencia": "Catálogo",
                    "catalogo_url": None,
                    "observacao": None,
                    "ativo": True,
                    "ordem": 1,
                    "criado_em": "2026-01-01T00:00:00Z",
                    "atualizado_em": "2026-01-01T00:00:00Z",
                }
            ],
        )
    valid_tokens = {
        "Bearer token-valido",
        "Bearer token-biblioteca",
        "Bearer token-hidraulica",
        "Bearer token-inativo",
        "Bearer token-sem-permissao",
    }
    if token not in valid_tokens:
        return httpx.Response(401, json={"message": "invalid token"})

    if request.url.path == "/auth/v1/user":
        return httpx.Response(
            200,
            json={"id": "user-123", "email": "usuario@sarengenharia.com.br"},
        )
    if request.url.path == "/rest/v1/sar_usuarios":
        active = token != "Bearer token-inativo"
        return httpx.Response(
            200,
            json=[
                {
                    "id": 10,
                    "user_id": "user-123",
                    "nome": "Usuário SAR",
                    "email": "usuario@sarengenharia.com.br",
                    "tipo_usuario": "master",
                    "ativo": active,
                }
            ],
        )
    if request.url.path == "/rest/v1/rpc/sar_minhas_permissoes":
        if token == "Bearer token-sem-permissao":
            return httpx.Response(200, json=[])
        permissions = [
            {
                "codigo": "HIDRAULICA_CALCULADORAS_FATOR_K",
                "visualizar": True,
                "editar": True,
                "excluir": True,
                "administrar": True,
            }
        ]
        if token == "Bearer token-biblioteca":
            permissions.append(
                {
                    "codigo": "BIBLIOTECA_TECNICA_EQUIPAMENTOS_HIDRAULICOS",
                    "visualizar": True,
                    "editar": True,
                    "excluir": True,
                    "administrar": True,
                }
            )
        if token == "Bearer token-hidraulica":
            permissions.extend(
                [
                    {
                        "codigo": "HIDRAULICA_REFERENCIAS_TABELA_TUBOS",
                        "visualizar": True,
                        "editar": False,
                        "excluir": False,
                        "administrar": False,
                    },
                    {
                        "codigo": "HIDRAULICA_REFERENCIAS_PERDA_CARGA_CONEXOES",
                        "visualizar": True,
                        "editar": False,
                        "excluir": False,
                        "administrar": False,
                    },
                ]
            )
        return httpx.Response(200, json=permissions)
    return httpx.Response(404, json={"message": "not found"})


def install_mock(client: TestClient) -> None:
    old_client = app.state.supabase_client
    app.state.supabase_client = httpx.AsyncClient(
        base_url="https://example.supabase.co",
        transport=httpx.MockTransport(supabase_transport),
    )
    client._old_supabase_client = old_client


def test_public_health() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


def test_protected_routes_reject_missing_token() -> None:
    with TestClient(app) as client:
        assert client.get("/api/v1/me").status_code == 401
        assert client.get("/api/fator-k?k=80&pressao=4").status_code == 401


def test_protected_route_accepts_active_authorized_user() -> None:
    with TestClient(app) as client:
        install_mock(client)
        response = client.get(
            "/api/fator-k?k=80&pressao=4",
            headers={"Authorization": "Bearer token-valido"},
        )
        assert response.status_code == 200
        assert response.json()["vazao_lpm"] == 160.0


def test_complete_factor_k_contract_calculates_and_converts() -> None:
    with TestClient(app) as client:
        install_mock(client)
        headers = {"Authorization": "Bearer token-valido"}

        factor = client.post(
            "/api/hidraulica/fator-k",
            headers=headers,
            json={
                "operacao": "calcular",
                "dados": {
                    "vazao": "160,00",
                    "unidade_vazao": "lmin",
                    "pressao": "4,00",
                    "unidade_pressao": "bar",
                },
            },
        )
        flow = client.post(
            "/api/hidraulica/fator-k",
            headers=headers,
            json={
                "operacao": "calcular_vazao",
                "dados": {
                    "fator_k": 80,
                    "unidade_fator_k": "lminbar",
                    "pressao": 4,
                    "unidade_pressao": "bar",
                },
            },
        )
        converted = client.post(
            "/api/hidraulica/fator-k",
            headers=headers,
            json={
                "operacao": "converter_k",
                "dados": {"valor": 80, "unidade": "lminbar"},
            },
        )

        assert factor.status_code == 200
        assert factor.json()["resultado"]["k_lmin_bar"] == 80
        assert factor.json()["versao_motor"] == "FATOR-K-RAILWAY-V1"
        assert flow.status_code == 200
        assert flow.json()["resultado"]["vazao_lmin"] == 160
        assert converted.status_code == 200
        assert converted.json()["resultado"]["k_lmin_bar"] == 80


def test_complete_factor_k_contract_loads_equipment_bank() -> None:
    with TestClient(app) as client:
        install_mock(client)
        response = client.post(
            "/api/hidraulica/fator-k",
            headers={"Authorization": "Bearer token-valido"},
            json={"operacao": "listar_equipamentos", "dados": {}},
        )
        assert response.status_code == 200
        records = response.json()["resultado"]["registros"]
        assert len(records) == 1
        assert records[0]["equipamento"] == "Sprinkler teste"
        assert records[0]["kBar"] == 80


def test_complete_factor_k_contract_rejects_invalid_operation() -> None:
    with TestClient(app) as client:
        install_mock(client)
        response = client.post(
            "/api/hidraulica/fator-k",
            headers={"Authorization": "Bearer token-valido"},
            json={"operacao": "operacao_inexistente", "dados": {}},
        )
        assert response.status_code == 400
        assert response.json()["sucesso"] is False


def test_equipment_library_requires_its_own_permission() -> None:
    with TestClient(app) as client:
        install_mock(client)
        denied = client.post(
            "/api/hidraulica/fator-k",
            headers={"Authorization": "Bearer token-valido"},
            json={"operacao": "listar_equipamentos_biblioteca", "dados": {}},
        )
        allowed = client.post(
            "/api/hidraulica/fator-k",
            headers={"Authorization": "Bearer token-biblioteca"},
            json={"operacao": "listar_equipamentos_biblioteca", "dados": {}},
        )
        assert denied.status_code == 403
        assert allowed.status_code == 200
        assert allowed.json()["resultado"]["registros"][0]["codigo"] == "SPK-TESTE"


def test_equipment_library_edit_operation_is_preserved() -> None:
    with TestClient(app) as client:
        install_mock(client)
        response = client.post(
            "/api/hidraulica/fator-k",
            headers={"Authorization": "Bearer token-biblioteca"},
            json={
                "operacao": "salvar_equipamento",
                "dados": {
                    "codigo": "SPK TESTE",
                    "categoria": "Sprinkler",
                    "nome_equipamento": "Sprinkler teste",
                    "tipo_equipamento": "sprinkler",
                    "fabricante": "SAR",
                    "modelo": "T-01",
                    "forma_dimensionamento": "fator_k",
                    "fator_k_valor_original": 80,
                    "fator_k_unidade_original": "lmin_sqrt_bar",
                    "ativo": True,
                },
            },
        )
        assert response.status_code == 200
        assert response.json()["resultado"]["registro"]["codigo"] == "SPK-TESTE"


def test_hydraulic_reference_routes_reject_missing_token() -> None:
    with TestClient(app) as client:
        tubes = client.post(
            "/api/hidraulica/tubulacoes",
            json={"operacao": "listar_tubulacoes", "dados": {}},
        )
        losses = client.post(
            "/api/hidraulica/perda-carga-conexoes",
            json={"operacao": "listar_comprimentos_equivalentes", "dados": {}},
        )
        assert tubes.status_code == 401
        assert losses.status_code == 401


def test_hydraulic_reference_routes_load_both_banks() -> None:
    with TestClient(app) as client:
        install_mock(client)
        headers = {"Authorization": "Bearer token-hidraulica"}
        tubes = client.post(
            "/api/hidraulica/tubulacoes",
            headers=headers,
            json={"operacao": "listar_tubulacoes", "dados": {}},
        )
        losses = client.post(
            "/api/hidraulica/perda-carga-conexoes",
            headers=headers,
            json={"operacao": "listar_comprimentos_equivalentes", "dados": {}},
        )

        assert tubes.status_code == 200
        assert tubes.json()["resultado"]["total"] == 1
        assert tubes.json()["resultado"]["registros"][0]["codigo"] == (
            "ACO-SCH40-DN50"
        )
        assert tubes.json()["versao_motor"] == "TUBULACOES-RAILWAY-V1"

        assert losses.status_code == 200
        assert losses.json()["resultado"]["total"] == 1
        assert losses.json()["resultado"]["registros"][0][
            "comprimento_equivalente_m"
        ] == 1.1
        assert losses.json()["versao_motor"] == (
            "PERDA-CARGA-CONEXOES-RAILWAY-V1"
        )


def test_hydraulic_reference_routes_require_permission() -> None:
    with TestClient(app) as client:
        install_mock(client)
        headers = {"Authorization": "Bearer token-sem-permissao"}
        tubes = client.post(
            "/api/hidraulica/tubulacoes",
            headers=headers,
            json={"operacao": "listar_tubulacoes", "dados": {}},
        )
        losses = client.post(
            "/api/hidraulica/perda-carga-conexoes",
            headers=headers,
            json={"operacao": "listar_comprimentos_equivalentes", "dados": {}},
        )
        assert tubes.status_code == 403
        assert losses.status_code == 403


def test_hydraulic_reference_route_rejects_wrong_operation() -> None:
    with TestClient(app) as client:
        install_mock(client)
        response = client.post(
            "/api/hidraulica/perda-carga-conexoes",
            headers={"Authorization": "Bearer token-hidraulica"},
            json={"operacao": "apagar_banco", "dados": {}},
        )
        assert response.status_code == 400
        assert response.json()["sucesso"] is False


def test_protected_routes_reject_invalid_or_inactive_user() -> None:
    with TestClient(app) as client:
        install_mock(client)
        invalid = client.get(
            "/api/v1/me",
            headers={"Authorization": "Bearer token-invalido"},
        )
        inactive = client.get(
            "/api/v1/me",
            headers={"Authorization": "Bearer token-inativo"},
        )
        assert invalid.status_code == 401
        assert inactive.status_code == 403


def test_technical_route_rejects_user_without_module_permission() -> None:
    with TestClient(app) as client:
        install_mock(client)
        response = client.get(
            "/api/fator-k?k=80&pressao=4",
            headers={"Authorization": "Bearer token-sem-permissao"},
        )
        assert response.status_code == 403


def test_cors_only_allows_configured_origin() -> None:
    with TestClient(app) as client:
        allowed = client.options(
            "/api/v1/me",
            headers={
                "Origin": "https://sarengenharia.com.br",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        assert allowed.status_code == 200
        assert allowed.headers["access-control-allow-origin"] == (
            "https://sarengenharia.com.br"
        )

        denied = client.options(
            "/api/v1/me",
            headers={
                "Origin": "https://site-nao-autorizado.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" not in denied.headers
