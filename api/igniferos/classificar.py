import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# A URL e a publishable key não são segredos: são as mesmas credenciais públicas
# usadas pelo cliente Supabase no navegador. As variáveis da Vercel continuam
# tendo prioridade, mas estes valores evitam indisponibilidade quando o runtime
# de uma implantação não recebe a configuração do projeto.
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or "https://bjtxbpmrmhfvpmdsthxr.supabase.co"
).strip().rstrip("/")
SUPABASE_ANON_KEY = (
    os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    or "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM"
).strip()
CODIGO_MODULO = "PRODUTOS_IGNIFEROS"


def resposta_json(handler, status, payload):
    corpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(corpo)))
    handler.end_headers()
    handler.wfile.write(corpo)


def requisicao_supabase(caminho, token, metodo="GET", payload=None):
    corpo = None
    if payload is not None:
        corpo = json.dumps(payload).encode("utf-8")

    requisicao = Request(
        f"{SUPABASE_URL}{caminho}",
        data=corpo,
        method=metodo,
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    with urlopen(requisicao, timeout=10) as retorno:
        conteudo = retorno.read().decode("utf-8")
        return json.loads(conteudo) if conteudo else None


def numero(valor, campo, obrigatorio=False):
    if valor is None or valor == "":
        if obrigatorio:
            raise ValueError(f"O campo {campo} é obrigatório.")
        return None
    if isinstance(valor, bool):
        raise ValueError(f"O campo {campo} deve ser numérico.")
    try:
        resultado = float(valor)
    except (TypeError, ValueError) as erro:
        raise ValueError(f"O campo {campo} deve ser numérico.") from erro
    if resultado != resultado or resultado in (float("inf"), float("-inf")):
        raise ValueError(f"O campo {campo} deve ser um número finito.")
    return resultado


def dentro_do_limite(valor, minimo, minimo_inclusivo, maximo, maximo_inclusivo):
    if valor is None:
        return minimo is None and maximo is None
    if minimo is not None:
        if valor < float(minimo) or (valor == float(minimo) and not minimo_inclusivo):
            return False
    if maximo is not None:
        if valor > float(maximo) or (valor == float(maximo) and not maximo_inclusivo):
            return False
    return True


def classificar(registros, ponto_fulgor, ponto_ebulicao):
    for regra in sorted(registros, key=lambda item: item.get("ordem", 999)):
        if not dentro_do_limite(
            ponto_fulgor,
            regra.get("ponto_fulgor_min"),
            regra.get("ponto_fulgor_min_inclusivo", True),
            regra.get("ponto_fulgor_max"),
            regra.get("ponto_fulgor_max_inclusivo", False),
        ):
            continue

        exige_ebulicao = (
            regra.get("ponto_ebulicao_min") is not None
            or regra.get("ponto_ebulicao_max") is not None
        )
        if exige_ebulicao and ponto_ebulicao is None:
            continue
        if exige_ebulicao and not dentro_do_limite(
            ponto_ebulicao,
            regra.get("ponto_ebulicao_min"),
            regra.get("ponto_ebulicao_min_inclusivo", True),
            regra.get("ponto_ebulicao_max"),
            regra.get("ponto_ebulicao_max_inclusivo", False),
        ):
            continue
        return regra
    return None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            resposta_json(self, 500, {
                "classificado": False,
                "erro": "configuracao_incompleta",
                "mensagem": "A função de classificação não está configurada.",
            })
            return

        autorizacao = self.headers.get("Authorization", "")
        if not autorizacao.startswith("Bearer "):
            resposta_json(self, 401, {
                "classificado": False,
                "erro": "sessao_ausente",
                "mensagem": "Sessão de usuário não informada.",
            })
            return
        token = autorizacao[7:].strip()

        try:
            tamanho = int(self.headers.get("Content-Length", "0"))
            if tamanho <= 0 or tamanho > 10_000:
                raise ValueError("Requisição inválida.")
            dados = json.loads(self.rfile.read(tamanho).decode("utf-8"))
            ponto_fulgor = numero(dados.get("ponto_fulgor"), "ponto de fulgor", True)
            ponto_ebulicao = numero(dados.get("ponto_ebulicao"), "ponto de ebulição")
            numero(dados.get("pressao_vapor"), "pressão de vapor")

            # Valida o JWT diretamente no Supabase Auth.
            requisicao_supabase("/auth/v1/user", token)

            # Usa a mesma fonte de autorização do guard das páginas do SAR.
            permissoes = requisicao_supabase(
                "/rest/v1/rpc/sar_minhas_permissoes", token, "POST", {}
            ) or []
            permissao = next(
                (
                    item for item in permissoes
                    if str(item.get("codigo", "")).strip().upper() == CODIGO_MODULO
                ),
                None,
            )
            if not permissao or permissao.get("visualizar") is not True:
                resposta_json(self, 403, {
                    "classificado": False,
                    "erro": "sem_permissao",
                    "mensagem": "Seu usuário não possui acesso a este módulo.",
                })
                return

            campos = (
                "ordem,classe,categoria,descricao,"
                "ponto_fulgor_min,ponto_fulgor_min_inclusivo,"
                "ponto_fulgor_max,ponto_fulgor_max_inclusivo,"
                "ponto_ebulicao_min,ponto_ebulicao_min_inclusivo,"
                "ponto_ebulicao_max,ponto_ebulicao_max_inclusivo"
            )
            regras = requisicao_supabase(
                "/rest/v1/sar_tec_igniferos_classificacoes"
                f"?select={campos}&ativo=eq.true&order=ordem.asc",
                token,
            ) or []

            regra = classificar(regras, ponto_fulgor, ponto_ebulicao)
            if regra is None:
                if ponto_fulgor < 22.8 and ponto_ebulicao is None:
                    mensagem = (
                        "Informe o ponto de ebulição para distinguir as classes IA e IB."
                    )
                    erro = "ponto_ebulicao_obrigatorio"
                else:
                    mensagem = "Os dados informados não correspondem a uma classe ativa."
                    erro = "classificacao_nao_encontrada"
                resposta_json(self, 422, {
                    "classificado": False,
                    "erro": erro,
                    "mensagem": mensagem,
                })
                return

            resposta_json(self, 200, {
                "classificado": True,
                "classe": regra["classe"],
                "categoria": regra["categoria"],
                "descricao": regra["descricao"],
            })
        except HTTPError as erro:
            status = 401 if erro.code == 401 else 502
            resposta_json(self, status, {
                "classificado": False,
                "erro": "falha_supabase",
                "mensagem": (
                    "Sua sessão expirou. Entre novamente no SAR."
                    if erro.code == 401
                    else "Não foi possível consultar o serviço de classificação."
                ),
            })
        except (URLError, TimeoutError):
            resposta_json(self, 503, {
                "classificado": False,
                "erro": "servico_indisponivel",
                "mensagem": "O serviço de classificação está temporariamente indisponível.",
            })
        except (ValueError, json.JSONDecodeError) as erro:
            resposta_json(self, 400, {
                "classificado": False,
                "erro": "dados_invalidos",
                "mensagem": str(erro),
            })
        except Exception:
            resposta_json(self, 500, {
                "classificado": False,
                "erro": "erro_interno",
                "mensagem": "Não foi possível concluir a classificação.",
            })

    def do_GET(self):
        resposta_json(self, 405, {
            "classificado": False,
            "erro": "metodo_nao_permitido",
            "mensagem": "Use POST para classificar um produto.",
        })
