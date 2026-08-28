import crypto from "node:crypto";

const COOKIE_NAME = "sar_classificator";

/*
 * IMPORTANTE
 * ----------
 * A classificação começa SOMENTE na Fase 2.
 *
 * Fase 1 -> Fase 2:
 * apenas navegação/tela. Não classifica.
 *
 * Nesta versão o motor já registra os critérios da Fase 2,
 * mas NÃO inventa um resultado normativo antes de receber
 * os demais critérios das próximas fases.
 */

// Enquanto a Fase 3 ainda não foi construída, mantenha false.
// Quando a Fase 3 estiver pronta, altere somente para true.
const FASE_03_ATIVA = false;


/* =========================================================
 * UTILITÁRIOS DE SESSÃO
 * ========================================================= */

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const index = item.indexOf("=");
        if (index < 0) return [item, ""];
        return [item.slice(0, index), item.slice(index + 1)];
      })
  );
}

function assinar(valor, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(valor)
    .digest("base64url");
}

function assinaturasIguais(a, b) {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);

    if (ba.length !== bb.length) return false;

    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function validarSessao(req) {
  const secret = process.env.GAME_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("GAME_SESSION_SECRET ausente.");
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];

  if (!token) {
    const error = new Error("SESSAO_AUSENTE");
    error.code = "SESSAO_AUSENTE";
    throw error;
  }

  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    const error = new Error("SESSAO_INVALIDA");
    error.code = "SESSAO_INVALIDA";
    throw error;
  }

  const esperada = assinar(encoded, secret);

  if (!assinaturasIguais(signature, esperada)) {
    const error = new Error("SESSAO_INVALIDA");
    error.code = "SESSAO_INVALIDA";
    throw error;
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
  } catch {
    const error = new Error("SESSAO_INVALIDA");
    error.code = "SESSAO_INVALIDA";
    throw error;
  }

  const agora = Math.floor(Date.now() / 1000);

  if (
    payload.game !== "classificator" ||
    !payload.nonce ||
    !payload.exp ||
    payload.exp <= agora
  ) {
    const error = new Error("SESSAO_EXPIRADA");
    error.code = "SESSAO_EXPIRADA";
    throw error;
  }

  return payload;
}


/* =========================================================
 * SUPABASE - SOMENTE SERVER SIDE
 * ========================================================= */

function configSupabase() {
  const url = process.env.GAME_SUPABASE_URL;
  const key = process.env.GAME_SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Configuração Supabase do GAME ausente.");
  }

  return {
    baseUrl: url.replace(/\/+$/, ""),
    key
  };
}

async function obterSessao(sessionId) {
  const { baseUrl, key } = configSupabase();

  const endpoint =
    `${baseUrl}/rest/v1/sar_game_classificator_sessoes` +
    `?session_id=eq.${encodeURIComponent(sessionId)}` +
    `&select=session_id,fase_atual,estado,classificacao,expira_em` +
    `&limit=1`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "apikey": key,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const detalhe = await response.text();
    console.error("GAME - obter sessão:", response.status, detalhe);
    throw new Error("Falha ao obter sessão.");
  }

  const dados = await response.json();

  if (!Array.isArray(dados) || !dados.length) {
    const error = new Error("SESSAO_NAO_ENCONTRADA");
    error.code = "SESSAO_NAO_ENCONTRADA";
    throw error;
  }

  const sessao = dados[0];

  if (
    sessao.expira_em &&
    new Date(sessao.expira_em).getTime() <= Date.now()
  ) {
    const error = new Error("SESSAO_EXPIRADA");
    error.code = "SESSAO_EXPIRADA";
    throw error;
  }

  return sessao;
}

async function atualizarSessao(
  sessionId,
  faseAtual,
  estado,
  classificacao
) {
  const { baseUrl, key } = configSupabase();

  const endpoint =
    `${baseUrl}/rest/v1/sar_game_classificator_sessoes` +
    `?session_id=eq.${encodeURIComponent(sessionId)}`;

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "apikey": key,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      fase_atual: faseAtual,
      estado,
      classificacao,
      atualizado_em: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const detalhe = await response.text();
    console.error("GAME - atualizar sessão:", response.status, detalhe);
    throw new Error("Falha ao atualizar sessão.");
  }
}

async function buscarMensagem(codigo) {
  const { baseUrl, key } = configSupabase();

  const endpoint =
    `${baseUrl}/rest/v1/sar_game_classificator_mensagens` +
    `?codigo=eq.${encodeURIComponent(codigo)}` +
    `&ativo=eq.true` +
    `&select=texto` +
    `&limit=1`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "apikey": key,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const detalhe = await response.text();
    console.error("GAME - buscar mensagem:", response.status, detalhe);
    throw new Error("Falha ao buscar mensagem.");
  }

  const dados = await response.json();

  if (!Array.isArray(dados) || !dados.length || !dados[0]?.texto) {
    return "Opção registrada. Seguindo com a classificação.";
  }

  return String(dados[0].texto).trim();
}


/* =========================================================
 * MAPA PRIVADO DAS OPÇÕES DA FASE 2
 *
 * O frontend envia somente o código da opção.
 * A interpretação técnica fica aqui no servidor.
 * ========================================================= */

const OPCOES_FASE_02 = Object.freeze({

  PAV_1_SEM_SUBSOLO: {
    mensagem: "FASE_02_PAV_1_SEM_SUBSOLO",
    pavimentos: {
      faixa: "1",
      total_exato: 1,
      minimo: 1
    },
    possui_subsolo: false
  },

  PAV_2_SEM_SUBSOLO: {
    mensagem: "FASE_02_PAV_2_SEM_SUBSOLO",
    pavimentos: {
      faixa: "2",
      total_exato: 2,
      minimo: 2
    },
    possui_subsolo: false
  },

  PAV_3_SEM_SUBSOLO: {
    mensagem: "FASE_02_PAV_3_SEM_SUBSOLO",
    pavimentos: {
      faixa: "3",
      total_exato: 3,
      minimo: 3
    },
    possui_subsolo: false
  },

  PAV_4_MAIS_SEM_SUBSOLO: {
    mensagem: "FASE_02_PAV_4_MAIS_SEM_SUBSOLO",
    pavimentos: {
      faixa: "4_ou_mais",
      total_exato: null,
      minimo: 4
    },
    possui_subsolo: false
  },

  PAV_1_COM_SUBSOLO: {
    mensagem: "FASE_02_PAV_1_COM_SUBSOLO",
    pavimentos: {
      faixa: "1",
      total_exato: 1,
      minimo: 1
    },
    possui_subsolo: true
  },

  PAV_2_COM_SUBSOLO: {
    mensagem: "FASE_02_PAV_2_COM_SUBSOLO",
    pavimentos: {
      faixa: "2",
      total_exato: 2,
      minimo: 2
    },
    possui_subsolo: true
  },

  PAV_3_COM_SUBSOLO: {
    mensagem: "FASE_02_PAV_3_COM_SUBSOLO",
    pavimentos: {
      faixa: "3",
      total_exato: 3,
      minimo: 3
    },
    possui_subsolo: true
  },

  PAV_4_MAIS_COM_SUBSOLO: {
    mensagem: "FASE_02_PAV_4_MAIS_COM_SUBSOLO",
    pavimentos: {
      faixa: "4_ou_mais",
      total_exato: null,
      minimo: 4
    },
    possui_subsolo: true
  }

});


/* =========================================================
 * MOTOR 1 - NAVEGAÇÃO
 *
 * Decide somente qual tela vem depois.
 * Não decide classificação normativa.
 * ========================================================= */

function motorNavegacao(fase, opcao) {
  if (fase === "fase-02" && OPCOES_FASE_02[opcao]) {
    return {
      fase: "fase-03",
      destino: "/game-classificator/fase-03/",
      liberado: FASE_03_ATIVA
    };
  }

  const error = new Error("CAMINHO_NAO_PERMITIDO");
  error.code = "CAMINHO_NAO_PERMITIDO";
  throw error;
}


/* =========================================================
 * MOTOR 2 - CLASSIFICAÇÃO
 *
 * A classificação COMEÇA AQUI, NA FASE 2.
 *
 * Nesta etapa ele registra os critérios conhecidos:
 * - quantidade total de pavimentos (considerando o térreo)
 * - existência de subsolo
 *
 * Ele NÃO fecha CLCB/AVCB/PT/PTS ainda, pois os demais
 * critérios normativos ainda serão recebidos nas fases
 * seguintes.
 * ========================================================= */

function motorClassificacao(
  estadoAtual = {},
  classificacaoAtual = {},
  opcao
) {
  const regra = OPCOES_FASE_02[opcao];

  if (!regra) {
    const error = new Error("OPCAO_INVALIDA");
    error.code = "OPCAO_INVALIDA";
    throw error;
  }

  const estado = {
    ...estadoAtual,

    edificacao: {
      ...(estadoAtual.edificacao || {}),

      pavimentos: {
        criterio_contagem:
          "Quantidade total de pavimentos da edificação, considerando o térreo.",

        faixa: regra.pavimentos.faixa,
        total_exato: regra.pavimentos.total_exato,
        minimo: regra.pavimentos.minimo
      },

      subsolo: {
        possui: regra.possui_subsolo
      }
    },

    ultima_resposta: {
      fase: "fase-02",
      opcao,
      registrada_em: new Date().toISOString()
    }
  };

  const criteriosAtuais =
    classificacaoAtual?.criterios &&
    typeof classificacaoAtual.criterios === "object"
      ? classificacaoAtual.criterios
      : {};

  const classificacao = {
    status: "em_andamento",
    iniciada_na_fase:
      classificacaoAtual?.iniciada_na_fase || "fase-02",

    criterios: {
      ...criteriosAtuais,

      pavimentos: {
        recebido: true,
        faixa: regra.pavimentos.faixa,
        total_exato: regra.pavimentos.total_exato,
        minimo: regra.pavimentos.minimo
      },

      subsolo: {
        recebido: true,
        possui: regra.possui_subsolo
      }
    },

    /*
     * Ainda não há resultado parcial/final.
     * Isso será preenchido quando as regras normativas
     * correspondentes forem incorporadas às próximas fases.
     */
    resultado_parcial: null,
    resultado_final: null,

    atualizado_em: new Date().toISOString()
  };

  return {
    estado,
    classificacao,
    mensagemCodigo: regra.mensagem
  };
}


/* =========================================================
 * HANDLER
 * ========================================================= */

export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      ok: false,
      erro: "METODO_NAO_PERMITIDO"
    });
  }

  try {
    const token = validarSessao(req);

    const fase = String(req.body?.fase || "")
      .trim()
      .toLowerCase();

    const opcao = String(req.body?.opcao || "")
      .trim()
      .toUpperCase();

    /*
     * A primeira resposta classificatória aceita nesta
     * versão é SOMENTE a Fase 2.
     */
    if (fase !== "fase-02") {
      return res.status(400).json({
        ok: false,
        erro: "FASE_NAO_PERMITIDA"
      });
    }

    if (!OPCOES_FASE_02[opcao]) {
      return res.status(400).json({
        ok: false,
        erro: "OPCAO_INVALIDA"
      });
    }

    const sessao = await obterSessao(token.nonce);

    /*
     * MOTOR DE CLASSIFICAÇÃO
     */
    const classificado = motorClassificacao(
      sessao.estado || {},
      sessao.classificacao || {},
      opcao
    );

    /*
     * MOTOR DE NAVEGAÇÃO
     */
    const navegacao = motorNavegacao(
      fase,
      opcao
    );

    /*
     * Mensagem editável no Supabase
     */
    const mensagem = await buscarMensagem(
      classificado.mensagemCodigo
    );

    /*
     * Enquanto a Fase 3 não estiver liberada,
     * a sessão permanece indicando Fase 2 concluída.
     */
    const faseAtualBanco =
      navegacao.liberado
        ? navegacao.fase
        : "fase-02";

    const estadoFinal = {
      ...classificado.estado,
      fase_02_concluida: true,
      proxima_fase_planejada: navegacao.fase
    };

    await atualizarSessao(
      token.nonce,
      faseAtualBanco,
      estadoFinal,
      classificado.classificacao
    );

    /*
     * Retorno mínimo.
     * Regras, mapas e classificação interna não são enviados.
     */
    return res.status(200).json({
      ok: true,
      mensagem,
      next: navegacao.liberado
        ? navegacao.destino
        : null
    });

  } catch (error) {

    console.error(
      "GAME ClassificaTOR - responder:",
      error
    );

    const errosSessao = new Set([
      "SESSAO_AUSENTE",
      "SESSAO_INVALIDA",
      "SESSAO_EXPIRADA",
      "SESSAO_NAO_ENCONTRADA"
    ]);

    if (errosSessao.has(error.code)) {
      return res.status(401).json({
        ok: false,
        erro: error.code
      });
    }

    if (
      error.code === "CAMINHO_NAO_PERMITIDO" ||
      error.code === "OPCAO_INVALIDA"
    ) {
      return res.status(400).json({
        ok: false,
        erro: error.code
      });
    }

    return res.status(500).json({
      ok: false,
      erro: "ERRO_INTERNO"
    });
  }
}
