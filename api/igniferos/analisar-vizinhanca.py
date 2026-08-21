import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler


RULE_VERSION = "IT25-2025-P3-26.1-V1"
DEFAULT_SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"


def request_status(url, headers):
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


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
            return self.send_json(401, {"analisado": False, "mensagem": "Sessão não informada."})

        supabase_url = (os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL).strip().rstrip("/")
        supabase_key = (os.environ.get("SUPABASE_ANON_KEY") or DEFAULT_SUPABASE_KEY).strip()
        auth_status = request_status(
            f"{supabase_url}/auth/v1/user",
            {"apikey": supabase_key, "Authorization": authorization},
        )
        if auth_status != 200:
            return self.send_json(401, {"analisado": False, "mensagem": "Sessão inválida ou expirada."})

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            tanks = body.get("tanques") or []
            distances = body.get("distancias") or []
            if not isinstance(tanks, list) or not isinstance(distances, list):
                raise ValueError
        except (TypeError, ValueError, json.JSONDecodeError):
            return self.send_json(400, {"analisado": False, "mensagem": "Dados de tanques ou distâncias inválidos."})

        distance_map = {}
        for item in distances:
            a = str(item.get("tanque_a_id") or "")
            b = str(item.get("tanque_b_id") or "")
            try:
                value = float(item.get("distancia_costado_costado_m"))
            except (TypeError, ValueError):
                continue
            distance_map[tuple(sorted((a, b)))] = value

        analyses = []
        for fire in tanks:
            fire_id = str(fire.get("id") or "")
            orientation = str(fire.get("orientacao") or "").lower()
            try:
                diameter = float(fire.get("diametro_m") or 0)
            except (TypeError, ValueError):
                diameter = 0
            for other in tanks:
                other_id = str(other.get("id") or "")
                if not fire_id or not other_id or fire_id == other_id:
                    continue
                distance = distance_map.get(tuple(sorted((fire_id, other_id))))
                base = {
                    "tanque_em_chamas_id": fire_id,
                    "tanque_analisado_id": other_id,
                    "distancia_informada_m": distance,
                    "referencia_calculada_m": None,
                    "limite_adotado_m": None,
                    "resultado": "pendente",
                    "justificativa": "",
                }
                if orientation == "horizontal":
                    base["justificativa"] = "Tanque horizontal exige a distância do dique de contenção do tanque em chamas ao costado do tanque adjacente."
                elif orientation != "vertical" or diameter <= 0:
                    base["justificativa"] = "Informe orientação e diâmetro válido do tanque em chamas."
                elif distance is None:
                    base["referencia_calculada_m"] = 1.5 * diameter
                    base["limite_adotado_m"] = max(1.5 * diameter, 15.0)
                    base["justificativa"] = "Informe a distância livre entre os costados."
                else:
                    reference = 1.5 * diameter
                    limit = max(reference, 15.0)
                    is_neighbor = distance < limit
                    base.update({
                        "referencia_calculada_m": reference,
                        "limite_adotado_m": limit,
                        "resultado": "vizinho" if is_neighbor else "nao_vizinho",
                        "justificativa": "Distância livre menor que o limite normativo." if is_neighbor else "Distância livre igual ou superior ao limite normativo.",
                    })
                analyses.append(base)

        return self.send_json(200, {
            "analisado": True,
            "analises": analyses,
            "versao_regra": RULE_VERSION,
        })

