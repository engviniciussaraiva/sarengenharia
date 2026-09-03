(function () {
  "use strict";

  if (window.SARAPI) {
    return;
  }

  const API_BASE_URL = "https://sar-api-production.up.railway.app";
  const SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM";
  const REQUEST_TIMEOUT_MS = 30000;

  let supabasePromise = null;

  class SARAPIError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = "SARAPIError";
      this.status = status || 0;
      this.payload = payload || null;
    }
  }

  async function getSupabase() {
    if (!supabasePromise) {
      supabasePromise = import(
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
      ).then(function (module) {
        return module.createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        );
      });
    }
    return supabasePromise;
  }

  async function getAccessToken() {
    const supabase = await getSupabase();
    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new SARAPIError(
        "Sua sessão expirou. Entre novamente no SAR.",
        401,
        null
      );
    }
    return session.access_token;
  }

  function buildUrl(path) {
    const normalizedPath = String(path || "").trim();
    if (!normalizedPath.startsWith("/")) {
      throw new SARAPIError("Caminho interno da API inválido.", 0, null);
    }
    return `${API_BASE_URL}${normalizedPath}`;
  }

  async function request(path, options) {
    const requestOptions = options || {};
    const token = await getAccessToken();
    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const headers = new Headers(requestOptions.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    let body = requestOptions.body;
    if (
      body !== undefined &&
      body !== null &&
      !(body instanceof FormData) &&
      typeof body !== "string"
    ) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(buildUrl(path), {
        method: requestOptions.method || "GET",
        headers,
        body,
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store"
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new SARAPIError(
          "O motor SAR demorou para responder. Tente novamente.",
          0,
          null
        );
      }
      throw new SARAPIError(
        "Não foi possível conectar ao motor SAR.",
        0,
        null
      );
    } finally {
      window.clearTimeout(timeout);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload?.mensagem ||
        payload?.detail ||
        `Falha no motor SAR (${response.status}).`;
      const apiError = new SARAPIError(message, response.status, payload);
      window.dispatchEvent(
        new CustomEvent("sar:api-erro", {
          detail: Object.freeze({
            status: response.status,
            mensagem: message
          })
        })
      );
      throw apiError;
    }
    return payload;
  }

  function get(path) {
    return request(path, { method: "GET" });
  }

  function post(path, body) {
    return request(path, { method: "POST", body });
  }

  window.SARAPI = Object.freeze({
    version: "1.0.0",
    baseUrl: API_BASE_URL,
    get,
    post,
    request
  });
})();
