import json
import math
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler


RULE_VERSION = "IT25-2025-P3-27-32-ESPUMA-VERTICAL-V1"
DEFAULT_SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def request_status(url, headers):
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def normalized_class(value):
    value = str(value or "").upper().replace("CLASSE", "").replace("-", "").replace(" ", "")
    aliases = {"1A": "IA", "1B": "IB", "1": "I", "2": "II", "3A": "IIIA", "3B": "IIIB"}
    return aliases.get(value, value)


def chambers(diameter):
    if diameter <= 24:
        return 1
    if diameter <= 36:
        return 2
    if diameter <= 42:
        return 3
    if diameter <= 48:
        return 4
    if diameter <= 54:
        return 5
    if diameter <= 60:
        return 6
    return math.ceil((math.pi * diameter * diameter / 4) / 465)


def calculate(data):
    diameter = number(data.get("diametro_m"))
    height = number(data.get("altura_m"))
    temperature = number(data.get("temperatura_c"), 25)
    lge_percent = number(data.get("dosagem_lge_percentual"), 3)
    total_class_iiia = number(data.get("volume_total_classe_iiia_m3"))
    liquid_class = normalized_class(data.get("classe_cenario") or data.get("classe_original"))
    foam_group = str(data.get("grupo_espuma") or "").lower()
    polar = foam_group in {"solventes_polares", "solvente_polar", "polares"}
    roof = str(data.get("tipo_teto") or "fixo").lower()
    inertized = data.get("inertizado") is True
    api620 = data.get("api_620") is True
    seal_width = number(data.get("largura_coroa_m"))
    messages = []

    if str(data.get("orientacao") or "").lower() != "vertical":
        return {"dimensionado": True, "exigido": False, "aplicavel": False, "motivo": "Este motor atende somente tanques verticais.", "versao_regra": RULE_VERSION}
    if diameter <= 0 or height <= 0 or not liquid_class or not foam_group:
        raise ValueError("Informe diâmetro, altura, classe do cenário e grupo de espuma.")
    if liquid_class == "IIIB" and temperature <= 60:
        return {"dimensionado": True, "exigido": False, "aplicavel": True, "motivo": "Classe IIIB sem preaquecimento acima de 60 °C: sistema de espuma não exigido.", "versao_regra": RULE_VERSION}
    if liquid_class == "IIIA" and total_class_iiia <= 120 and diameter <= 9:
        return {"dimensionado": True, "exigido": False, "aplicavel": True, "motivo": "Isenção da Tabela 3.11: Classe IIIA, total na bacia até 120 m³ e diâmetro até 9 m.", "versao_regra": RULE_VERSION}
    if inertized and roof == "fixo":
        return {"dimensionado": True, "exigido": False, "aplicavel": True, "motivo": "Tanque de teto fixo com sistema de inertização: sistema de espuma dispensado.", "versao_regra": RULE_VERSION}

    adopted_class = "IIIA" if liquid_class == "IIIB" else liquid_class
    floating = roof in {"flutuante", "flutuante_externo", "interno_flutuante"}
    area_total = math.pi * diameter * diameter / 4
    if floating and seal_width > 0:
        inner = max(0, diameter - 2 * seal_width)
        area = math.pi * (diameter * diameter - inner * inner) / 4
        rate, duration, method = 12.2, 20, "aplicador_fixo_coroa"
        messages.append("Área adotada: coroa formada entre o costado e o anteparo do selo.")
    elif floating:
        area = area_total
        rate, duration, method = 12.2, 20, "aplicador_fixo_coroa"
        messages.append("Largura da coroa não informada; foi adotada provisoriamente a área total. Informar a largura para concluir.")
    else:
        area = area_total
        if polar:
            if height <= 6 and diameter <= 4:
                method, rate, duration = "monitor", 16, 65
            else:
                method, rate, duration = "camera", 6.9, 55
        else:
            if diameter > 18:
                method = "camera"
            elif diameter > 9 or height > 6:
                method = "monitor"
            else:
                method = "manual"
            if method == "camera":
                rate = 4.1
                duration = {"I": 55, "IA": 55, "IB": 55, "II": 30, "IIIA": 20}.get(adopted_class, 55)
            else:
                rate = 6.5
                duration = {"I": 65, "IA": 65, "IB": 65, "II": 50, "IIIA": 30}.get(adopted_class, 65)

    if api620 and method == "camera":
        method = "monitor" if diameter > 9 else "manual"
        rate = 16 if polar else 6.5
        duration = 65 if polar or adopted_class in {"I", "IA", "IB"} else 50 if adopted_class == "II" else 30
        messages.append("Tanque API 620/sem solda fragilizada: proteção fixa por câmara substituída por aplicação capaz de atingir a face interna do costado.")
    if temperature >= 100:
        method = "monitor" if diameter > 9 else "manual"
        rate = 16 if polar else 6.5
        duration = 65 if polar or adopted_class in {"I", "IA", "IB"} else 50 if adopted_class == "II" else 30
        messages.append("Temperatura igual ou superior a 100 °C: não utilizar sistema fixo de aplicação de espuma.")

    wind = 20 if method in {"monitor", "manual"} else 0
    majorated_rate = rate * (1 + wind / 100)
    solution_flow = area * majorated_rate
    solution_volume = solution_flow * duration
    combat_lge = solution_volume * lge_percent / 100
    chamber_count = chambers(diameter) if method == "camera" else 0
    return {
        "dimensionado": True, "aplicavel": True, "exigido": True, "versao_regra": RULE_VERSION,
        "classe_adotada": adopted_class, "familia_espuma": "solvente_polar" if polar else "hidrocarboneto",
        "tipo_aplicacao": method, "area_aplicacao_m2": round(area, 6), "taxa_normativa_lpm_m2": rate,
        "majoracao_vento_percentual": wind, "taxa_adotada_lpm_m2": majorated_rate,
        "tempo_minimo_min": duration, "vazao_solucao_lpm": round(solution_flow, 6),
        "volume_solucao_l": round(solution_volume, 6), "dosagem_lge_percentual": lge_percent,
        "lge_combate_l": round(combat_lge, 6), "lge_reserva_l": round(combat_lge, 6),
        "lge_total_l": round(2 * combat_lge, 6), "quantidade_camaras": chamber_count,
        "avisos": messages, "motivo": "Dimensionamento mínimo conforme IT 25/2025, Parte 3."
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
            return self.send_json(401, {"dimensionado": False, "mensagem": "Sessão não informada."})
        supabase_url = (os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL).strip().rstrip("/")
        supabase_key = (os.environ.get("SUPABASE_ANON_KEY") or DEFAULT_SUPABASE_KEY).strip()
        if request_status(f"{supabase_url}/auth/v1/user", {"apikey": supabase_key, "Authorization": authorization}) != 200:
            return self.send_json(401, {"dimensionado": False, "mensagem": "Sessão inválida ou expirada."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            result = calculate(data)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(400, {"dimensionado": False, "mensagem": str(error) or "Dados inválidos."})
        return self.send_json(200, result)
