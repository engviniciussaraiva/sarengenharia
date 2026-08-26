import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler


RULE_VERSION = "IT25-2025-P2-P3-AFASTAMENTO-V3"
DEFAULT_SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"


def request_status(url, headers):
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def liquid_class(value):
    normalized = str(value or "").upper().replace("CLASSE", "").replace("-", "").replace(" ", "")
    return {"1": "I", "1A": "I", "1B": "I", "1C": "I", "IA": "I", "IB": "I", "IC": "I", "2": "II", "3A": "IIIA", "3B": "IIIB"}.get(normalized, normalized)


def minimum_spacing(a, b, containment, iiib_relaxed):
    diameter_a = number(a.get("diametro_m"))
    diameter_b = number(b.get("diametro_m"))
    diameter_sum = diameter_a + diameter_b
    if diameter_a <= 0 or diameter_b <= 0:
        return None, "Informe os diâmetros dos dois tanques."
    class_a = liquid_class(a.get("classe_cenario"))
    class_b = liquid_class(b.get("classe_cenario"))
    if iiib_relaxed and class_a == "IIIB" and class_b == "IIIB":
        return 1.0, "IT 25/2025 Parte 2, item 18.2.2(d): tanques exclusivamente Classe IIIB, mínimo de 1,00 m."
    if max(diameter_a, diameter_b) <= 45:
        return max(1.0, diameter_sum / 6), "IT 25/2025 Parte 2, Tabela 2.7: 1/6 da soma dos diâmetros, nunca inferior a 1,00 m."
    floating_types = {"flutuante", "flutuante_externo"}
    both_floating = str(a.get("tipo_teto") or "") in floating_types and str(b.get("tipo_teto") or "") in floating_types
    has_class_i_or_ii = "IIIB" not in {class_a, class_b} and (class_a in {"I", "II"} or class_b in {"I", "II"})
    remote_basin = containment == "isolated"
    if remote_basin:
        coefficient = 1 / 6 if both_floating or not has_class_i_or_ii else 1 / 4
        basin_label = "bacia de contenção à distância"
    else:
        coefficient = 1 / 4 if both_floating or not has_class_i_or_ii else 1 / 3
        basin_label = "dique em torno dos tanques"
    return diameter_sum * coefficient, f"IT 25/2025 Parte 2, Tabela 2.7: tanques acima de 45 m, {basin_label}."


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
            containment = str(body.get("tipo_contencao") or "around")
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
                    base["resultado"] = "cenario_bacia"
                    base["justificativa"] = "Regra SAR: tanque horizontal em chamas gera aplicação de espuma em toda a bacia, sem resfriamento e sem análise de tanques vizinhos."
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

        classes = {liquid_class(tank.get("classe_cenario")) for tank in tanks if tank.get("classe_cenario")}
        iiib_relaxed = not bool(classes.intersection({"I", "II"}))
        spacings = []
        for index, tank_a in enumerate(tanks):
            for tank_b in tanks[index + 1:]:
                tank_a_id = str(tank_a.get("id") or "")
                tank_b_id = str(tank_b.get("id") or "")
                if not tank_a_id or not tank_b_id:
                    continue
                pair_id = "|".join(sorted((tank_a_id, tank_b_id)))
                informed = distance_map.get(tuple(sorted((tank_a_id, tank_b_id))))
                minimum, criterion = minimum_spacing(tank_a, tank_b, containment, iiib_relaxed)
                if informed is None or minimum is None:
                    result = "pendente"
                else:
                    result = "atende" if informed + 1e-9 >= minimum else "nao_atende"
                spacings.append({
                    "par_id": pair_id,
                    "tanque_a_id": tank_a_id,
                    "tanque_b_id": tank_b_id,
                    "tanque_a_tag": tank_a.get("tag"),
                    "tanque_b_tag": tank_b.get("tag"),
                    "distancia_informada_m": informed,
                    "afastamento_minimo_m": round(minimum, 6) if minimum is not None else None,
                    "resultado": result,
                    "criterio": criterion,
                })

        return self.send_json(200, {
            "analisado": True,
            "analises": analyses,
            "afastamentos": spacings,
            "versao_regra": RULE_VERSION,
        })
