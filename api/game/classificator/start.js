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

  return `${encoded}.${signature}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.GAME_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    console.error("GAME_SESSION_SECRET ausente ou muito curto.");
    return res.status(500).json({ ok: false });
  }

  const token = createSessionToken(secret);

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
}
