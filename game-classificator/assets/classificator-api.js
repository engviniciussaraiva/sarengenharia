(() => {
  "use strict";

  const SESSION_KEY = "sar.classificator.session.v3";

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

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function start() {
    const data = await requireSarApi().post("/api/game/classificator/start", {});
    if (!data?.ok || !data?.sessao) throw new Error("Não foi possível iniciar o ClassificaTOR.");
    setSession(data.sessao);
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
    return postWithSession("/api/game/classificator/estado", { uf });
  }

  async function answer(fase, opcao = null, dados = null) {
    return postWithSession("/api/game/classificator/responder", { fase, opcao, dados });
  }

  async function status() {
    return postWithSession("/api/game/classificator/status", {});
  }

  window.SARClassificatorAPI = Object.freeze({
    start,
    selectState,
    answer,
    status,
    getSession,
    clearSession
  });
})();
