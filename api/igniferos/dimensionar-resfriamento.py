import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

RULE_VERSION="MOTOR-RESFRIAMENTO-BANCO-V2"
NORM_VERSION="IT25-2025-P3"
DEFAULT_SUPABASE_URL="https://bjtxbpmrmhfvpmdsthxr.supabase.co"
DEFAULT_SUPABASE_KEY="sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"

def number(value,default=0.0):
    try:return float(value)
    except (TypeError,ValueError):return default

def request_status(url,headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=15) as response:return response.status
    except urllib.error.HTTPError as error:return error.code

def request_json(url,headers):
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=15) as response:return json.loads(response.read().decode("utf-8"))

def load_rules(url,key):
    headers={"apikey":key,"Authorization":f"Bearer {key}"}
    tables={"systems":"sar_norm_resfriamento_sistemas","times":"sar_norm_resfriamento_tempos","rates":"sar_norm_resfriamento_taxas_vizinhos","parameters":"sar_norm_resfriamento_parametros"}
    query=urllib.parse.urlencode({"versao_norma":f"eq.{NORM_VERSION}","ativo":"eq.true","select":"*"})
    return {name:request_json(f"{url}/rest/v1/{table}?{query}",headers) for name,table in tables.items()}

def normalize_class(value):
    value=str(value or "").upper().replace("CLASSE","").replace("-","").replace(" ","")
    return {"1":"I","1A":"I","1B":"I","IA":"I","IB":"I","2":"II","3A":"IIIA","3B":"IIIB"}.get(value,value)

def parameter(rules,code):
    row=next((x for x in rules["parameters"] if x.get("codigo")==code),None)
    if not row:raise ValueError(f"Parâmetro normativo ausente: {code}.")
    return number(row.get("valor_numerico"))

def system_rule(rows,liquid_class,height,volume):
    for row in rows:
        if row.get("classe_produto")!=liquid_class:continue
        if row.get("altura_min_inclusiva_m") is not None and height<number(row["altura_min_inclusiva_m"]):continue
        if row.get("altura_max_exclusiva_m") is not None and height>=number(row["altura_max_exclusiva_m"]):continue
        if row.get("volume_min_exclusivo_m3") is not None and volume<=number(row["volume_min_exclusivo_m3"]):continue
        if row.get("volume_max_inclusivo_m3") is not None and volume>number(row["volume_max_inclusivo_m3"]):continue
        return row
    raise ValueError("Não existe regra ativa de sistema de resfriamento para este tanque.")

def time_rule(rows,volume):
    for row in rows:
        if row.get("volume_min_inclusivo_m3") is not None and volume<number(row["volume_min_inclusivo_m3"]):continue
        if row.get("volume_max_exclusivo_m3") is not None and volume>=number(row["volume_max_exclusivo_m3"]):continue
        return row
    raise ValueError("Não existe tempo de combate ativo para este volume de risco.")

def neighbor_rate(rows,distance):
    for row in rows:
        if row.get("distancia_min_exclusiva_m") is not None and distance<=number(row["distancia_min_exclusiva_m"]):continue
        if row.get("distancia_max_inclusiva_m") is not None and distance>number(row["distancia_max_inclusiva_m"]):continue
        return row
    raise ValueError("Não existe taxa ativa para a distância informada.")

def shell_area(tank):
    d=number(tank.get("diametro_m"));h=number(tank.get("altura_m"));length=number(tank.get("comprimento_m"))
    return math.pi*d*h if tank.get("orientacao")=="vertical" else length*d

def roof_area(tank):return math.pi*number(tank.get("diametro_m"))**2/4

def calculate(data,rules):
    fire=data.get("tanque_em_chamas") or {};neighbors=data.get("vizinhos") or []
    if fire.get("orientacao")=="horizontal":
        return {"dimensionado":True,"cenario_bacia":True,"vazao_total_lpm":0,"volume_resfriamento_m3":0,"motivo":"Regra SAR: tanque horizontal em chamas recebe espuma em toda a bacia, sem resfriamento.","versao_regra":RULE_VERSION,"versao_norma":NORM_VERSION}
    if fire.get("orientacao")!="vertical":raise ValueError("Orientação do tanque em chamas inválida.")
    height=number(fire.get("altura_m"));risk_volume=number(data.get("volume_risco_m3"));tank_volume=number(fire.get("capacidade_m3"))
    if risk_volume<20:
        return {"dimensionado":True,"isento":True,"vazao_total_lpm":0,"volume_resfriamento_m3":0,"motivo":"Volume do risco inferior a 20 m³.","versao_regra":RULE_VERSION,"versao_norma":NORM_VERSION}
    liquid_class=normalize_class(fire.get("classe_cenario"))
    method_volume=risk_volume if tank_volume<20 else tank_volume
    if liquid_class=="IIIA":method_volume=max(method_volume,number(data.get("volume_total_classe_iiia_m3")))
    selected=str(fire.get("metodo_adotado") or "")
    system=system_rule(rules["systems"],liquid_class,height,method_volume)
    minimum=system["sistema_minimo"]
    if minimum=="isento":
        return {"dimensionado":True,"isento":True,"vazao_total_lpm":0,"volume_resfriamento_m3":0,"motivo":"Cenário isento conforme Tabela 3.1.","referencia":system["referencia"],"versao_regra":RULE_VERSION,"versao_norma":NORM_VERSION}
    # O usuário pode adotar uma solução equivalente ou superior ao mínimo
    # normativo, mas nunca reduzir o nível de proteção calculado pelo motor.
    allowed={"manual_ou_monitor":{"manual","monitor","aspersao"},"monitor":{"monitor","aspersao"},"aspersao":{"aspersao"}}[minimum]
    method=selected if selected in allowed else ("monitor" if minimum=="manual_ou_monitor" else minimum)
    warnings=[]
    own_area=shell_area(fire);own_rate=parameter(rules,"taxa_tanque_vertical_em_chamas");own_flow=own_area*own_rate
    count=len(neighbors);details=[];neighbor_flow=0
    for tank in neighbors:
        if tank.get("orientacao")=="horizontal":base_area=number(tank.get("comprimento_m"))*number(tank.get("diametro_m"));area_note="projeção horizontal"
        else:
            include_roof=tank.get("tipo_teto") in {"fixo","interno_flutuante"}
            base_area=shell_area(tank)+(roof_area(tank) if include_roof else 0);area_note="teto + costado" if include_roof else "somente costado"
        if method=="aspersao":
            applied_area=base_area;rate=parameter(rules,"taxa_vizinho_por_aspersao");reference="Tabela 3.3"
        else:
            factor=parameter(rules,"fator_area_ate_2_vizinhos" if count<=2 else "fator_area_mais_2_vizinhos")
            applied_area=base_area*factor;rate_row=neighbor_rate(rules["rates"],number(tank.get("distancia_m")));rate=number(rate_row["taxa_lpm_m2"]);reference=rate_row["referencia"]
        flow=applied_area*rate;neighbor_flow+=flow
        details.append({"tanque_id":tank.get("id"),"tag":tank.get("tag"),"area_base_m2":round(base_area,6),"area_aplicacao_m2":round(applied_area,6),"taxa_lpm_m2":rate,"vazao_lpm":round(flow,6),"criterio_area":area_note,"referencia":reference})
    duration=time_rule(rules["times"],risk_volume);minutes=number(duration["tempo_horas"])*60;total_flow=own_flow+neighbor_flow
    return {"dimensionado":True,"isento":False,"sistema_minimo":minimum,"metodo_adotado":method,"tanque_em_chamas":{"area_m2":round(own_area,6),"taxa_lpm_m2":own_rate,"vazao_lpm":round(own_flow,6)},"vizinhos":details,"vazao_vizinhos_lpm":round(neighbor_flow,6),"vazao_total_lpm":round(total_flow,6),"tempo_horas":number(duration["tempo_horas"]),"tempo_minutos":minutes,"volume_resfriamento_m3":round(total_flow*minutes/1000,6),"avisos":warnings,"referencia_sistema":system["referencia"],"referencia_tempo":duration["referencia"],"versao_regra":RULE_VERSION,"versao_norma":NORM_VERSION}

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
            if any(not rows for rows in rules.values()):raise ValueError("Banco normativo de resfriamento incompleto.")
            return self.send_json(200,calculate(data,rules))
        except urllib.error.HTTPError as error:return self.send_json(502,{"dimensionado":False,"mensagem":f"Falha ao consultar banco normativo ({error.code})."})
        except (ValueError,TypeError,json.JSONDecodeError) as error:return self.send_json(400,{"dimensionado":False,"mensagem":str(error)})
