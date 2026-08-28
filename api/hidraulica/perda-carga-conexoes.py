import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


MOTOR_VERSION = "PERDA-CARGA-CONEXOES-VERCEL-V1"
DEFAULT_SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"
VIEW_NAME = "vw_hidraulica_comprimentos_equivalentes"


def request_json(url, headers):
    request = urllib.request.Request(url, headers=headers)
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


def load_records(supabase_url, service_key):
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY não configurada na Vercel.")

    query = urllib.parse.urlencode(
        {
            "select": "*",
            "order": "material.asc,dn_mm.asc,ordem.asc",
            "limit": "5000",
        }
    )
    records = request_json(
        f"{supabase_url}/rest/v1/{VIEW_NAME}?{query}",
        {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
    )
    if not isinstance(records, list):
        raise RuntimeError("O banco de conexões retornou uma resposta inválida.")
    return records


def execute(body, supabase_url, service_key):
    operation = str(body.get("operacao") or "").strip().lower()
    if operation != "listar_comprimentos_equivalentes":
        raise ValueError("Operação do banco de conexões não reconhecida.")
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
        if request_status(
            f"{supabase_url}/auth/v1/user",
            {"apikey": supabase_key, "Authorization": authorization},
        ) != 200:
            return self.send_json(
                401,
                {"sucesso": False, "mensagem": "Sessão inválida ou expirada."},
            )

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
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
                    "mensagem": "Não foi possível consultar o banco de conexões.",
                },
            )
