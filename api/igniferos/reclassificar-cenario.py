import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


RULE_VERSION = "IT25-2025-P3-TERMICA-V1"


def request_json(url, headers):
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8"))
        except Exception:
            body = {}
        return error.code, body


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
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        supabase_key = os.environ.get("SUPABASE_ANON_KEY", "")
        if not supabase_url or not supabase_key:
            return self.send_json(500, {"classificado": False, "mensagem": "Configuração do servidor incompleta."})

        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return self.send_json(401, {"classificado": False, "mensagem": "Sessão não informada."})

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            product_id = int(body.get("produto_id"))
            temperature = float(body.get("temperatura_considerada_c"))
            if product_id <= 0:
                raise ValueError
        except (TypeError, ValueError, json.JSONDecodeError):
            return self.send_json(400, {"classificado": False, "mensagem": "Produto ou temperatura inválidos."})

        common_headers = {
            "apikey": supabase_key,
            "Authorization": authorization,
            "Accept": "application/json",
        }
        auth_status, _ = request_json(f"{supabase_url}/auth/v1/user", common_headers)
        if auth_status != 200:
            return self.send_json(401, {"classificado": False, "mensagem": "Sessão inválida ou expirada."})

        query = urllib.parse.urlencode({
            "id": f"eq.{product_id}",
            "select": "id,ponto_fulgor,classe_calculada,classe",
        })
        product_status, products = request_json(
            f"{supabase_url}/rest/v1/sar_tec_igniferos_produtos?{query}",
            common_headers,
        )
        if product_status != 200:
            return self.send_json(502, {"classificado": False, "mensagem": "Não foi possível consultar o produto no catálogo."})
        if not products:
            return self.send_json(404, {"classificado": False, "mensagem": "Produto não encontrado ou não permitido para este usuário."})

        product = products[0]
        original = str(product.get("classe_calculada") or product.get("classe") or "").upper().replace(" ", "")
        if not original:
            return self.send_json(422, {"classificado": False, "mensagem": "O produto não possui classe original calculada."})

        try:
            flash_point = float(product["ponto_fulgor"]) if product.get("ponto_fulgor") is not None else None
        except (TypeError, ValueError):
            flash_point = None

        scenario_class = original
        warnings = []
        if flash_point is not None and temperature >= flash_point:
            scenario_class = "I"
            warnings.append(
                "Temperatura considerada igual ou superior ao ponto de fulgor: aplicar requisitos de líquido Classe I."
            )
        elif original == "IIIB" and temperature >= 60:
            scenario_class = "IIIA"
            warnings.append("Líquido Classe IIIB aquecido a 60 °C ou mais: aplicar requisitos de Classe IIIA.")
        if temperature >= 100:
            warnings.append(
                "Produto armazenado a 100 °C ou mais: verificar as restrições ao sistema fixo de espuma e a proteção por linhas manuais ou canhões-monitores."
            )

        return self.send_json(200, {
            "classificado": True,
            "classe_original": original,
            "classe_cenario": scenario_class,
            "temperatura_considerada_c": temperature,
            "avisos": warnings,
            "versao_regra": RULE_VERSION,
        })

