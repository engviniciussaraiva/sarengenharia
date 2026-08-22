import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler


RULE_VERSION = "MOTOR-ESPUMA-VERTICAL-BANCO-V2"
NORM_VERSION = "IT25-2025-P3"
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


def request_json(url, headers):
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def load_rules(supabase_url, service_key):
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    tables = {
        "application": "sar_norm_espuma_aplicacao",
        "minimum": "sar_norm_espuma_metodo_minimo",
        "chambers": "sar_norm_espuma_camaras",
        "lines": "sar_norm_espuma_linhas_suplementares",
        "exemptions": "sar_norm_espuma_isencoes",
        "parameters": "sar_norm_espuma_parametros",
    }
    query = urllib.parse.urlencode({"versao_norma": f"eq.{NORM_VERSION}", "ativo": "eq.true", "select": "*"})
    return {name: request_json(f"{supabase_url}/rest/v1/{table}?{query}", headers) for name, table in tables.items()}


def in_range(value, minimum_exclusive, maximum_inclusive):
    return (minimum_exclusive is None or value > number(minimum_exclusive)) and (maximum_inclusive is None or value <= number(maximum_inclusive))


def minimum_method(rules, family, roof, diameter, height):
    matches = [row for row in rules if (row.get("familia_produto") in (None, family)) and row.get("tipo_teto") == roof and in_range(diameter, row.get("diametro_min_exclusivo"), row.get("diametro_max_inclusivo")) and in_range(height, row.get("altura_min_exclusiva"), row.get("altura_max_inclusiva"))]
    if not matches:
        raise ValueError("Não existe regra ativa de método mínimo para esta geometria.")
    return sorted(matches, key=lambda row: int(row.get("prioridade") or 100))[0]


def application_rule(rules, family, liquid_class, method):
    matches = [row for row in rules if row.get("tipo_aplicacao") == method and row.get("familia_produto") in (None, family) and row.get("classe_produto") in (None, liquid_class)]
    if not matches:
        raise ValueError("Não existe taxa e tempo ativos para esta combinação normativa.")
    matches.sort(key=lambda row: (row.get("familia_produto") is None, row.get("classe_produto") is None))
    return matches[0]


def calculate_chamber_count(diameter, rows):
    row = next((item for item in rows if in_range(diameter, item.get("diametro_min_exclusivo"), item.get("diametro_max_inclusivo"))), None)
    if not row:
        raise ValueError("Não existe faixa ativa para quantidade de câmaras.")
    if row.get("quantidade") is not None:
        return int(row["quantidade"])
    return math.ceil((math.pi * diameter * diameter / 4) / number(row.get("area_por_unidade_m2")))


def parameter(rules, code):
    row = next((item for item in rules["parameters"] if item.get("codigo") == code), None)
    if not row:
        raise ValueError(f"Parâmetro normativo ausente: {code}.")
    return number(row.get("valor_numerico"))


def calculate(data, rules):
    diameter = number(data.get("diametro_m"))
    height = number(data.get("altura_m"))
    temperature = number(data.get("temperatura_c"), 25)
    lge_percent = number(data.get("dosagem_lge_percentual"), 3)
    total_class_iiia = number(data.get("volume_total_classe_iiia_m3"))
    largest_vertical_diameter = number(data.get("maior_diametro_vertical_m"), diameter)
    liquid_class = normalized_class(data.get("classe_cenario") or data.get("classe_original"))
    foam_group = str(data.get("grupo_espuma") or "").lower()
    polar = foam_group in {"solventes_polares", "solvente_polar", "polares"}
    roof = str(data.get("tipo_teto") or "fixo").lower()
    inertized = data.get("inertizado") is True
    api620 = data.get("api_620") is True
    seal_width = number(data.get("largura_coroa_m"))
    product_name = str(data.get("produto_armazenado") or "Não informado")
    requested_method = str(data.get("tipo_aplicacao_adotado") or "").lower()
    messages = []

    if str(data.get("orientacao") or "").lower() != "vertical":
        return {"dimensionado": True, "exigido": False, "aplicavel": False, "motivo": "Este motor atende somente tanques verticais.", "versao_regra": RULE_VERSION}
    if diameter <= 0 or height <= 0 or not liquid_class or not foam_group:
        raise ValueError("Informe diâmetro, altura, classe do cenário e grupo de espuma.")
    for exemption in rules["exemptions"]:
        if exemption.get("classe_produto") != liquid_class:
            continue
        volume_ok = exemption.get("volume_total_max_m3") is None or total_class_iiia <= number(exemption.get("volume_total_max_m3"))
        diameter_ok = exemption.get("diametro_max_m") is None or diameter <= number(exemption.get("diametro_max_m"))
        temperature_ok = exemption.get("temperatura_max_c") is None or temperature <= number(exemption.get("temperatura_max_c"))
        if volume_ok and diameter_ok and temperature_ok:
            return {"dimensionado": True, "exigido": False, "aplicavel": True, "motivo": exemption["motivo"], "referencia": exemption.get("referencia"), "versao_norma": NORM_VERSION, "versao_regra": RULE_VERSION}
    if inertized and roof == "fixo":
        return {"dimensionado": True, "exigido": False, "aplicavel": True, "motivo": "Tanque de teto fixo com sistema de inertização: sistema de espuma dispensado.", "versao_regra": RULE_VERSION}

    adopted_class = "IIIA" if liquid_class == "IIIB" else liquid_class
    floating = roof in {"flutuante", "flutuante_externo", "interno_flutuante"}
    if roof == "flutuante":
        roof = "flutuante_externo"
    family = "solvente_polar" if polar else "hidrocarboneto"
    area_total = math.pi * diameter * diameter / 4
    if floating and seal_width > 0:
        inner = max(0, diameter - 2 * seal_width)
        area = math.pi * (diameter * diameter - inner * inner) / 4
        messages.append("Área adotada: coroa formada entre o costado e o anteparo do selo.")
    elif floating:
        area = area_total
        messages.append("Largura da coroa não informada; foi adotada provisoriamente a área total. Informar a largura para concluir.")
    else:
        area = area_total
    minimum_row = minimum_method(rules["minimum"], family, roof, diameter, height)
    method = minimum_row["tipo_aplicacao_minimo"]
    minimum_adopted_method = method
    if not floating and requested_method in {"camera", "monitor", "manual"}:
        ranks = {"manual": 1, "monitor": 2, "camera": 3}
        if ranks[requested_method] >= ranks.get(minimum_adopted_method, 1):
            method = requested_method
            if method != minimum_adopted_method:
                messages.append(f"Método mínimo indicado: {minimum_adopted_method}. Método adotado pelo projetista: {method}.")
        else:
            messages.append(f"A opção {requested_method} é inferior ao método mínimo exigido ({minimum_adopted_method}) e não foi adotada.")

    if api620 and method == "camera":
        method = "monitor" if diameter > 9 else "manual"
        messages.append("Tanque API 620/sem solda fragilizada: proteção fixa por câmara substituída por aplicação capaz de atingir a face interna do costado.")
    if temperature >= parameter(rules, "temperatura_max_sistema_fixo_c"):
        method = "monitor" if diameter > 9 else "manual"
        messages.append("Temperatura igual ou superior a 100 °C: não utilizar sistema fixo de aplicação de espuma.")

    application = application_rule(rules["application"], family, adopted_class, method)
    rate = number(application["taxa_lpm_m2"])
    duration = number(application["tempo_minimo_min"])
    wind = number(application.get("majoracao_vento_percentual"))
    majorated_rate = rate * (1 + wind / 100)
    solution_flow = area * majorated_rate
    solution_volume = solution_flow * duration
    combat_lge = solution_volume * lge_percent / 100
    reserve_lge = combat_lge * parameter(rules, "fator_reserva_lge")
    chamber_count = calculate_chamber_count(diameter, rules["chambers"]) if method == "camera" else 0
    line_rule = next((item for item in rules["lines"] if in_range(largest_vertical_diameter, item.get("diametro_min_exclusivo"), item.get("diametro_max_inclusivo"))), None)
    if not line_rule:
        raise ValueError("Não existe regra ativa para linhas suplementares.")
    return {
        "dimensionado": True, "aplicavel": True, "exigido": True, "versao_regra": RULE_VERSION,
        "classe_adotada": adopted_class, "familia_espuma": "solvente_polar" if polar else "hidrocarboneto",
        "tipo_aplicacao": method, "area_aplicacao_m2": round(area, 6), "taxa_normativa_lpm_m2": rate,
        "majoracao_vento_percentual": wind, "taxa_adotada_lpm_m2": majorated_rate,
        "tempo_minimo_min": duration, "vazao_solucao_lpm": round(solution_flow, 6),
        "volume_solucao_l": round(solution_volume, 6), "dosagem_lge_percentual": lge_percent,
        "lge_combate_l": round(combat_lge, 6), "lge_reserva_l": round(reserve_lge, 6),
        "lge_total_l": round(combat_lge + reserve_lge, 6), "quantidade_camaras": chamber_count,
        "linhas_suplementares": {"quantidade": int(line_rule["quantidade_linhas"]), "vazao_por_linha_lpm": number(line_rule["vazao_por_linha_lpm"]), "tempo_minimo_min": number(line_rule["tempo_minimo_min"]), "referencia": line_rule.get("referencia")},
        "avisos": messages, "motivo": f"Diâmetro: {diameter:g} m · Altura: {height:g} m · Produto armazenado: {product_name}",
        "versao_norma": NORM_VERSION, "referencia_taxa_tempo": application.get("referencia"), "referencia_metodo": minimum_row.get("referencia")
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
            service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
            if not service_key:
                return self.send_json(500, {"dimensionado": False, "mensagem": "SUPABASE_SERVICE_ROLE_KEY não configurada no Vercel."})
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            rules = load_rules(supabase_url, service_key)
            if any(not rows for rows in rules.values()):
                raise ValueError("Banco normativo de espuma incompleto ou sem regras ativas.")
            result = calculate(data, rules)
        except urllib.error.HTTPError as error:
            return self.send_json(502, {"dimensionado": False, "mensagem": f"Falha ao consultar o banco normativo ({error.code})."})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(400, {"dimensionado": False, "mensagem": str(error) or "Dados inválidos."})
        return self.send_json(200, result)
