import crypto from "node:crypto";

const COOKIE_NAME = "sar_classificator";

/*
 * =========================================================
 * GAME ClassificaTOR - SELEÇÃO DE ESTADO
 *
 * Esta etapa NÃO classifica a edificação.
 * Ela apenas define a jurisdição / pacote normativo
 * que será usado nas fases seguintes.
 *
 * Nesta versão:
 * SP = disponível
 * demais UFs = não liberadas
 * =========================================================
 */

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

function configSupabase() {
  const url = process.env.GAME_SUPABASE_URL;
  const key = process.env.GAME_SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "GAME_SUPABASE_URL/GAME_SUPABASE_SECRET_KEY ausentes."
    );
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

    console.error(
      "GAME ClassificaTOR - obter sessão:",
      response.status,
      detalhe
    );

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

async function atualizarJurisdicao(sessionId, estadoAtual, classificacao) {
  const { baseUrl, key } = configSupabase();

  const endpoint =
    `${baseUrl}/rest/v1/sar_game_classificator_sessoes` +
    `?session_id=eq.${encodeURIComponent(sessionId)}`;

  const novoEstado = {
    ...(estadoAtual || {}),

    jurisdicao: {
      pais: "BR",
      uf: "SP",
      estado: "São Paulo",
      autoridade: "CBPMESP",
      pacote_normativo: "SP"
    },

    ultima_resposta: {
      fase: "estado",
      opcao: "SP",
      registrada_em: new Date().toISOString()
    }
  };

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "apikey": key,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      fase_atual: "fase-01",
      estado: novoEstado,

      /*
       * IMPORTANTE:
       * a classificação permanece exatamente como estava.
       * Selecionar SP NÃO inicia classificação.
       */
      classificacao,

      atualizado_em: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const detalhe = await response.text();

    console.error(
      "GAME ClassificaTOR - atualizar jurisdição:",
      response.status,
      detalhe
    );

    throw new Error("Falha ao registrar jurisdição.");
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

    console.error(
      "GAME ClassificaTOR - mensagem estado:",
      response.status,
      detalhe
    );

    throw new Error("Falha ao buscar mensagem.");
  }

  const dados = await response.json();

  if (!Array.isArray(dados) || !dados.length || !dados[0]?.texto) {
    return (
      "Você selecionou o Estado de São Paulo. " +
      "O ClassificaTOR utilizará a base normativa aplicável a São Paulo. " +
      "Seguindo para a configuração do lote!"
    );
  }

  return String(dados[0].texto).trim();
}

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

    const uf = String(req.body?.uf || "")
      .trim()
      .toUpperCase();

    /*
     * Nesta versão somente São Paulo está liberado.
     */
    if (uf !== "SP") {
      return res.status(400).json({
        ok: false,
        erro: "ESTADO_NAO_DISPONIVEL"
      });
    }

    const sessao = await obterSessao(token.nonce);

    await atualizarJurisdicao(
      token.nonce,
      sessao.estado || {},
      sessao.classificacao || {
        status: "nao_iniciada",
        iniciada_na_fase: null,
        criterios: {},
        resultado_parcial: null,
        resultado_final: null
      }
    );

    const mensagem = await buscarMensagem(
      "ESTADO_SP_SELECIONADO"
    );

    /*
     * Retorno mínimo ao navegador.
     * O frontend não recebe regras normativas.
     */
    return res.status(200).json({
      ok: true,
      mensagem,
      next: "/game-classificator/fase-01/"
    });

  } catch (error) {

    console.error(
      "GAME ClassificaTOR - estado:",
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

    return res.status(500).json({
      ok: false,
      erro: "ERRO_INTERNO"
    });
  }
}
