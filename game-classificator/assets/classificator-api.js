(() => {
  "use strict";

  const SESSION_KEY = "sar.classificator.session.v3";
  const STATE_KEY = "sar.classificator.state.v4";
  const STATE_TTL_MS = 30000;

  function requireSarApi() {
    if (!window.SARAPI) {
      throw new Error("Motor SAR indisponível.");
    }
    return window.SARAPI;
  }

  function getSession() {
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  function setSession(value) {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
  }

  function clearCachedState() {
    sessionStorage.removeItem(STATE_KEY);
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    clearCachedState();
  }

  function saveState(data) {
    if (!data || typeof data !== "object") return;
    if (!Array.isArray(data.criterios) && !data.classificacao && data.implantacao_concluida === undefined) return;
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          data
        })
      );
    } catch (_) {
      /* sessionStorage indisponível não deve bloquear o GAME */
    }
  }

  function getCachedState(maxAgeMs = STATE_TTL_MS) {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || !Number.isFinite(Number(parsed.savedAt))) return null;
      if (Date.now() - Number(parsed.savedAt) > maxAgeMs) return null;
      return parsed.data;
    } catch (_) {
      return null;
    }
  }

  async function start() {
    clearSession();
    const data = await requireSarApi().post("/api/game/classificator/start", {});
    if (!data?.ok || !data?.sessao) {
      throw new Error("Não foi possível iniciar o ClassificaTOR.");
    }
    setSession(data.sessao);
    saveState(data);
    return data;
  }

  async function postWithSession(path, body = {}) {
    const sessao = getSession();
    if (!sessao) {
      const error = new Error("Sessão do ClassificaTOR não encontrada.");
      error.code = "SESSAO_AUSENTE";
      throw error;
    }
    return requireSarApi().post(path, { sessao, ...body });
  }

  async function selectState(uf) {
    const data = await postWithSession("/api/game/classificator/estado", { uf });
    saveState(data);
    return data;
  }

  async function answer(fase, opcao = null, dados = null) {
    const data = await postWithSession("/api/game/classificator/responder", { fase, opcao, dados });
    saveState(data);
    return data;
  }

  async function status(options = {}) {
    const force = options?.force === true;
    if (!force) {
      const cached = getCachedState();
      if (cached) return cached;
    }
    const data = await postWithSession("/api/game/classificator/status", {});
    saveState(data);
    return data;
  }

  async function restart() {
    if (!getSession()) {
      return start();
    }
    const data = await postWithSession("/api/game/classificator/reiniciar", {});
    saveState(data);
    return data;
  }

  window.SARClassificatorAPI = Object.freeze({
    start,
    restart,
    selectState,
    answer,
    status,
    getSession,
    getCachedState,
    clearCachedState,
    clearSession
  });
})();
