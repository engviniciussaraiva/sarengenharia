import json
import math
import os
import unicodedata
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler


MOTOR_VERSION = "FATOR-K-VERCEL-V1"
DEFAULT_SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"

LITERS_PER_US_GALLON = 3.785411784
BAR_PER_MCA = 0.0980665
BAR_PER_PSI = 0.0689475729
BAR_PER_KGFCM2 = 0.980665

FLOW_UNITS = {"lmin", "ls", "m3h", "gpm"}
PRESSURE_UNITS = {"bar", "kgfcm2", "mca", "kpa", "mpa", "psi"}
K_UNITS = {"lminbar", "lminmca", "gpmpsi"}


def parse_number(value):
    if isinstance(value, bool) or value is None:
        raise ValueError("Valor numérico inválido.")
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip().replace(" ", "")
        if not text:
            raise ValueError("Valor numérico não informado.")
        if "," in text and "." in text:
            text = text.replace(".", "").replace(",", ".")
        elif "," in text:
            text = text.replace(",", ".")
        try:
            number = float(text)
        except ValueError as error:
            raise ValueError("Valor numérico inválido.") from error
    if not math.isfinite(number):
        raise ValueError("Valor numérico inválido.")
    return number


def positive_number(value, field_name):
    number = parse_number(value)
    if number <= 0:
        raise ValueError(f"{field_name} deve ser maior que zero.")
    return number


def normalized_unit(value, allowed, field_name):
    unit = str(value or "").strip().lower()
    if unit not in allowed:
        raise ValueError(f"{field_name} não reconhecida.")
    return unit


def flow_to_lmin(value, unit):
    unit = normalized_unit(unit, FLOW_UNITS, "Unidade de vazão")
    factors = {
        "lmin": 1.0,
        "ls": 60.0,
        "m3h": 1000.0 / 60.0,
        "gpm": LITERS_PER_US_GALLON,
    }
    return value * factors[unit]


def pressure_to_bar(value, unit):
    unit = normalized_unit(unit, PRESSURE_UNITS, "Unidade de pressão")
    factors = {
        "bar": 1.0,
        "kgfcm2": BAR_PER_KGFCM2,
        "mca": BAR_PER_MCA,
        "kpa": 0.01,
        "mpa": 10.0,
        "psi": BAR_PER_PSI,
    }
    return value * factors[unit]


def k_to_lmin_bar(value, unit):
    unit = normalized_unit(unit, K_UNITS, "Unidade do Fator K")
    if unit == "lminbar":
        return value
    if unit == "lminmca":
        return value / math.sqrt(BAR_PER_MCA)
    return value * LITERS_PER_US_GALLON / math.sqrt(BAR_PER_PSI)


def k_equivalents(k_lmin_bar):
    return {
        "k_lmin_bar": round(k_lmin_bar, 9),
        "k_lmin_mca": round(k_lmin_bar * math.sqrt(BAR_PER_MCA), 9),
        "k_gpm_psi": round(
            k_lmin_bar * math.sqrt(BAR_PER_PSI) / LITERS_PER_US_GALLON,
            9,
        ),
    }


def calculate_from_flow_pressure(data):
    flow_original = positive_number(data.get("vazao"), "Vazão")
    pressure_original = positive_number(data.get("pressao"), "Pressão")
    flow_unit = normalized_unit(
        data.get("unidade_vazao"), FLOW_UNITS, "Unidade de vazão"
    )
    pressure_unit = normalized_unit(
        data.get("unidade_pressao"), PRESSURE_UNITS, "Unidade de pressão"
    )
    flow_lmin = flow_to_lmin(flow_original, flow_unit)
    pressure_bar = pressure_to_bar(pressure_original, pressure_unit)
    result = k_equivalents(flow_lmin / math.sqrt(pressure_bar))
    result.update(
        {
            "vazao_original": flow_original,
            "unidade_vazao": flow_unit,
            "pressao_original": pressure_original,
            "unidade_pressao": pressure_unit,
            "vazao_lmin": round(flow_lmin, 9),
            "pressao_bar": round(pressure_bar, 9),
        }
    )
    return result


def convert_k(data):
    original = positive_number(data.get("valor"), "Fator K")
    unit = normalized_unit(data.get("unidade"), K_UNITS, "Unidade do Fator K")
    result = k_equivalents(k_to_lmin_bar(original, unit))
    result.update({"valor_original": original, "unidade_original": unit})
    return result


def convert_inputs(data):
    result = {}
    if data.get("vazao") not in (None, ""):
        flow = positive_number(data.get("vazao"), "Vazão")
        result["vazao_lmin"] = round(
            flow_to_lmin(flow, data.get("unidade_vazao")), 9
        )
    if data.get("pressao") not in (None, ""):
        pressure = positive_number(data.get("pressao"), "Pressão")
        result["pressao_bar"] = round(
            pressure_to_bar(pressure, data.get("unidade_pressao")), 9
        )
    if not result:
        raise ValueError("Informe uma vazão ou uma pressão para conversão.")
    return result


def normalize_text(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in text if unicodedata.category(char) != "Mn").strip().lower()


def read_field(record, names):
    normalized_keys = {normalize_text(key): key for key in record.keys()}
    for name in names:
        original_key = normalized_keys.get(normalize_text(name))
        if original_key is not None:
            return record.get(original_key, "")
    return ""


def optional_positive(value):
    try:
        number = parse_number(value)
        return number if number > 0 else None
    except ValueError:
        return None


def optional_number(value):
    try:
        return parse_number(value)
    except ValueError:
        return None


def normalize_equipment(record):
    k_bar = optional_positive(
        read_field(record, ["FATOR_K_LMIN_BAR", "K_LMIN_BAR", "FATOR K LMIN BAR"])
    )
    k_mca = optional_positive(
        read_field(record, ["FATOR_K_LMIN_MCA", "K_LMIN_MCA", "FATOR K LMIN MCA"])
    )
    k_psi = optional_positive(
        read_field(record, ["FATOR_K_GPM_PSI", "K_GPM_PSI", "FATOR K GPM PSI"])
    )

    if k_bar is None and k_mca is not None:
        k_bar = k_to_lmin_bar(k_mca, "lminmca")
    if k_bar is None and k_psi is not None:
        k_bar = k_to_lmin_bar(k_psi, "gpmpsi")

    equivalents = k_equivalents(k_bar) if k_bar is not None else {
        "k_lmin_bar": None,
        "k_lmin_mca": None,
        "k_gpm_psi": None,
    }
    return {
        "id": read_field(record, ["ID"]),
        "categoria": read_field(record, ["CATEGORIA"]),
        "equipamento": read_field(record, ["EQUIPAMENTO"]),
        "fabricante": read_field(record, ["FABRICANTE"]),
        "modelo": read_field(record, ["MODELO"]),
        "diametro": read_field(
            record,
            ["DIAMETRO_NOMINAL", "DIÂMETRO_NOMINAL", "DIAMETRO", "DN"],
        ),
        "kBar": equivalents["k_lmin_bar"],
        "kMca": equivalents["k_lmin_mca"],
        "kPsi": equivalents["k_gpm_psi"],
        "aplicacao": read_field(record, ["APLICACAO", "APLICAÇÃO"]),
        "referencia": read_field(record, ["REFERENCIA", "REFERÊNCIA"]),
        "observacao": read_field(record, ["OBSERVACAO", "OBSERVAÇÃO"]),
        "status": read_field(record, ["STATUS"]),
        "ordem": optional_number(read_field(record, ["ORDEM"])),
    }


def normalize_records(data):
    records = data.get("registros")
    if not isinstance(records, list):
        raise ValueError("Lista de equipamentos inválida.")
    if len(records) > 2000:
        raise ValueError("O banco excede o limite de 2.000 registros por consulta.")
    if any(not isinstance(record, dict) for record in records):
        raise ValueError("Registro de equipamento inválido.")
    return [normalize_equipment(record) for record in records]


def request_status(url, headers):
    try:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except urllib.error.URLError:
        return 503


def execute(body):
    operation = str(body.get("operacao") or "").strip().lower()
    data = body.get("dados") or {}
    if not isinstance(data, dict):
        raise ValueError("Dados da operação inválidos.")

    if operation == "calcular":
        result = calculate_from_flow_pressure(data)
    elif operation == "converter_k":
        result = convert_k(data)
    elif operation == "converter_entradas":
        result = convert_inputs(data)
    elif operation == "normalizar_registros":
        result = {"registros": normalize_records(data)}
    else:
        raise ValueError("Operação do motor Fator K não reconhecida.")

    return {
        "sucesso": True,
        "operacao": operation,
        "resultado": result,
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
                401, {"sucesso": False, "mensagem": "Sessão não informada."}
            )

        supabase_url = (
            os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL
        ).strip().rstrip("/")
        supabase_key = (
            os.environ.get("SUPABASE_ANON_KEY") or DEFAULT_SUPABASE_KEY
        ).strip()
        auth_headers = {"apikey": supabase_key, "Authorization": authorization}
        if request_status(f"{supabase_url}/auth/v1/user", auth_headers) != 200:
            return self.send_json(
                401, {"sucesso": False, "mensagem": "Sessão inválida ou expirada."}
            )

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            return self.send_json(200, execute(body))
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(
                400, {"sucesso": False, "mensagem": str(error)}
            )

