import crypto from "node:crypto";

const COOKIE_NAME = "sar_classificator";
const SESSION_TTL_SECONDS = 60 * 60; // 1 hora

function base64url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function createSessionToken(secret) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    v: 1,
    game: "classificator",
    step: "fase-01",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(24).toString("base64url")
  };

  const encoded = base64url(JSON.stringify(payload));
  const signature = sign(encoded, secret);

  return {
    token: `${encoded}.${signature}`,
    payload
  };
}

async function criarSessaoNoBanco(payload) {
  const supabaseUrl = process.env.GAME_SUPABASE_URL;
  const supabaseSecretKey = process.env.GAME_SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Variáveis GAME_SUPABASE_URL/GAME_SUPABASE_SECRET_KEY ausentes.");
  }

  const endpoint =
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/sar_game_classificator_sessoes`;

  const expiraEm = new Date(payload.exp * 1000).toISOString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "apikey": supabaseSecretKey,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      session_id: payload.nonce,
      fase_atual: "fase-01",
      estado: {},
      classificacao: {
        status: "nao_iniciada",
        iniciada_na_fase: null,
        criterios: {},
        resultado_parcial: null,
        resultado_final: null
      },
      expira_em: expiraEm,
      atualizado_em: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const detalhe = await response.text();
    console.error("GAME ClassificaTOR - criar sessão:", response.status, detalhe);
    throw new Error("Falha ao criar sessão do GAME.");
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  try {
    const secret = process.env.GAME_SESSION_SECRET;

    if (!secret || secret.length < 32) {
      console.error("GAME_SESSION_SECRET ausente ou inválido.");
      return res.status(500).json({ ok: false });
    }

    const { token, payload } = createSessionToken(secret);

    // Cria apenas a sessão.
    // Nenhuma classificação ocorre na Tela Inicial ou na Fase 1.
    await criarSessaoNoBanco(payload);

    res.setHeader(
      "Set-Cookie",
      [
        `${COOKIE_NAME}=${token}`,
        "Path=/",
        `Max-Age=${SESSION_TTL_SECONDS}`,
        "HttpOnly",
        "Secure",
        "SameSite=Strict"
      ].join("; ")
    );

    return res.status(200).json({
      ok: true,
      next: "/game-classificator/fase-01/"
    });

  } catch (error) {
    console.error("GAME ClassificaTOR - start:", error);
    return res.status(500).json({ ok: false });
  }
}
