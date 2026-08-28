import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


MOTOR_VERSION = "TUBULACOES-VERCEL-V1-SUPABASE"
RESOURCE_CODE = "HIDRAULICA_REFERENCIAS_TABELA_TUBOS"
DEFAULT_SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"


FIELDS = [
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


def request_json(url, headers, method="GET", data=None):
    payload = None
    request_headers = dict(headers)
    if data is not None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(
        url,
        data=payload,
        headers=request_headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        content = response.read().decode("utf-8")
        return json.loads(content) if content else None


def request_status(url, headers):
    try:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except urllib.error.URLError:
        return 503


def has_view_permission(supabase_url, supabase_key, authorization):
    permissions = request_json(
        f"{supabase_url}/rest/v1/rpc/sar_minhas_permissoes",
        {
            "apikey": supabase_key,
            "Authorization": authorization,
            "Accept": "application/json",
        },
        method="POST",
        data={},
    )
    if not isinstance(permissions, list):
        return False
    for permission in permissions:
        code = str(permission.get("codigo") or "").strip().upper()
        if code == RESOURCE_CODE:
            return permission.get("visualizar") is True
    return False


def load_records(supabase_url, service_key):
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY não configurada na Vercel.")
    query = urllib.parse.urlencode(
        {
            "ativo": "eq.true",
            "select": ",".join(FIELDS),
            "order": "ordem.asc,material.asc,norma_classe.asc",
            "limit": "2000",
        }
    )
    rows = request_json(
        f"{supabase_url}/rest/v1/sar_tec_hidraulica_tubulacoes?{query}",
        {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
    )
    if not isinstance(rows, list):
        raise RuntimeError("O banco de tubulações retornou uma resposta inválida.")
    return rows


def execute(body, supabase_url, service_key):
    operation = str(body.get("operacao") or "").strip().lower()
    if operation != "listar_tubulacoes":
        raise ValueError("Operação da biblioteca de tubulações não reconhecida.")
    records = load_records(supabase_url, service_key)
    return {
        "sucesso": True,
        "operacao": operation,
        "resultado": {"registros": records, "total": len(records)},
        "versao_motor": MOTOR_VERSION,
    }


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return self.send_json(
                401,
                {"sucesso": False, "mensagem": "Sessão não informada."},
            )

        supabase_url = (
            os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL
        ).strip().rstrip("/")
        supabase_key = (
            os.environ.get("SUPABASE_ANON_KEY") or DEFAULT_SUPABASE_KEY
        ).strip()
        auth_headers = {
            "apikey": supabase_key,
            "Authorization": authorization,
        }
        if request_status(f"{supabase_url}/auth/v1/user", auth_headers) != 200:
            return self.send_json(
                401,
                {"sucesso": False, "mensagem": "Sessão inválida ou expirada."},
            )

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not has_view_permission(
                supabase_url,
                supabase_key,
                authorization,
            ):
                return self.send_json(
                    403,
                    {
                        "sucesso": False,
                        "mensagem": "Este recurso não está liberado para seu usuário.",
                    },
                )
            service_key = (
                os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
            ).strip()
            return self.send_json(
                200,
                execute(body, supabase_url, service_key),
            )
        except RuntimeError as error:
            return self.send_json(
                500,
                {"sucesso": False, "mensagem": str(error)},
            )
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(
                400,
                {"sucesso": False, "mensagem": str(error)},
            )
        except (urllib.error.HTTPError, urllib.error.URLError):
            return self.send_json(
                502,
                {
                    "sucesso": False,
                    "mensagem": "Não foi possível consultar o banco de tubulações.",
                },
            )
