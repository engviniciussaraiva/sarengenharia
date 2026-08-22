import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

RULE_VERSION="MOTOR-ESPUMA-BACIA-BANCO-V1"
NORM_VERSION="IT25-2025-P3"
DEFAULT_SUPABASE_URL="https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY="sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"

def number(value,default=0.0):
    try:return float(value)
    except (TypeError,ValueError):return default

def normalized_class(value):
    value=str(value or "").upper().replace("CLASSE","").replace("-","").replace(" ","")
    return {"1":"I","1A":"IA","1B":"IB","2":"II","3A":"IIIA","3B":"IIIB"}.get(value,value)

def request_status(url,headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=15) as response:return response.status
    except urllib.error.HTTPError as error:return error.code

def request_json(url,headers):
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=15) as response:return json.loads(response.read().decode("utf-8"))

def load_rules(url,key):
    headers={"apikey":key,"Authorization":f"Bearer {key}"}
    query=urllib.parse.urlencode({"versao_norma":f"eq.{NORM_VERSION}","ativo":"eq.true","select":"*"})
    return request_json(f"{url}/rest/v1/sar_norm_espuma_aplicacao?{query}",headers)

def application_rule(rules,family,liquid_class,method):
    matches=[row for row in rules if row.get("tipo_aplicacao")==method and row.get("familia_produto") in (None,family) and row.get("classe_produto") in (None,liquid_class)]
    if not matches:return None
    matches.sort(key=lambda row:(row.get("familia_produto") is None,row.get("classe_produto") is None))
    return matches[0]

def calculate(data,rules):
    area=number(data.get("area_util_bacia_m2"));lge=number(data.get("dosagem_lge_percentual"),3)
    method=str(data.get("tipo_aplicacao") or "camera").lower()
    if method not in {"camera","monitor","manual"}:raise ValueError("Tipo de aplicação da bacia inválido.")
    if area<=0:raise ValueError("Informe a área útil da bacia.")
    candidates=[]
    for product in data.get("produtos") or []:
        liquid_class=normalized_class(product.get("classe_cenario") or product.get("classe_original"))
        temperature=number(product.get("temperatura_c"),25)
        if liquid_class=="IIIB" and temperature<=60:continue
        adopted_class="IIIA" if liquid_class=="IIIB" else liquid_class
        group=str(product.get("grupo_espuma") or "").lower()
        family="solvente_polar" if group in {"solventes_polares","solvente_polar","polares"} else "hidrocarboneto"
        rule=application_rule(rules,family,adopted_class,method)
        if not rule:continue
        rate=number(rule.get("taxa_lpm_m2"));wind=number(rule.get("majoracao_vento_percentual"));adopted_rate=rate*(1+wind/100);duration=number(rule.get("tempo_minimo_min"));flow=area*adopted_rate;solution=flow*duration
        candidates.append({"produto":product.get("produto") or "Não informado","classe":liquid_class,"familia":family,"taxa_normativa_lpm_m2":rate,"majoracao_vento_percentual":wind,"taxa_adotada_lpm_m2":adopted_rate,"tempo_minimo_min":duration,"vazao_solucao_lpm":flow,"volume_solucao_l":solution,"referencia":rule.get("referencia")})
    if not candidates:return {"dimensionado":True,"exigido":False,"tipo_aplicacao":"isento","motivo":"Os produtos informados estão isentos de aplicação de espuma na condição considerada.","versao_regra":RULE_VERSION,"versao_norma":NORM_VERSION}
    governing=max(candidates,key=lambda item:item["volume_solucao_l"]);combat=governing["volume_solucao_l"]*lge/100
    return {"dimensionado":True,"exigido":True,"tipo_aplicacao":method,"area_aplicacao_m2":area,**governing,"dosagem_lge_percentual":lge,"lge_combate_l":combat,"lge_reserva_l":combat,"lge_total_l":combat*2,"alternativas_analisadas":len(candidates),"versao_regra":RULE_VERSION,"versao_norma":NORM_VERSION}

class handler(BaseHTTPRequestHandler):
    def send_json(self,status,body):
        payload=json.dumps(body,ensure_ascii=False).encode("utf-8");self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Cache-Control","no-store");self.send_header("Content-Length",str(len(payload)));self.end_headers();self.wfile.write(payload)
    def do_POST(self):
        authorization=self.headers.get("Authorization","")
        if not authorization.startswith("Bearer "):return self.send_json(401,{"dimensionado":False,"mensagem":"Sessão não informada."})
        url=(os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL).strip().rstrip("/");anon=(os.environ.get("SUPABASE_ANON_KEY") or DEFAULT_SUPABASE_KEY).strip()
        if request_status(f"{url}/auth/v1/user",{"apikey":anon,"Authorization":authorization})!=200:return self.send_json(401,{"dimensionado":False,"mensagem":"Sessão inválida ou expirada."})
        service=(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        if not service:return self.send_json(500,{"dimensionado":False,"mensagem":"SUPABASE_SERVICE_ROLE_KEY não configurada."})
        try:
            length=int(self.headers.get("Content-Length","0"));data=json.loads(self.rfile.read(length).decode("utf-8"));rules=load_rules(url,service)
            if not rules:raise ValueError("Banco normativo de espuma incompleto.")
            return self.send_json(200,calculate(data,rules))
        except urllib.error.HTTPError as error:return self.send_json(502,{"dimensionado":False,"mensagem":f"Falha ao consultar banco normativo ({error.code})."})
        except (ValueError,TypeError,json.JSONDecodeError) as error:return self.send_json(400,{"dimensionado":False,"mensagem":str(error)})
