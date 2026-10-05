(() => {
  "use strict";

  const SESSION_KEY = "sar.classificator.session.v3";
  const STATE_KEY = "sar.classificator.state.v5.performance";
  const STATIC_KEY = "sar.classificator.static.v2.performance";
  const HEIGHT_KEY = "sar.classificator.height.v2.performance";
  const SEARCH_KEY = "sar.classificator.search.v2.performance";
  const REPORT_KEY = "sar.classificator.report.v2.performance";

  const STATE_TTL_MS = 5 * 60 * 1000;
  const STATIC_TTL_MS = 15 * 60 * 1000;
  const HEIGHT_TTL_MS = 10 * 60 * 1000;
  const SEARCH_TTL_MS = 3 * 60 * 1000;
  const REPORT_TTL_MS = 60 * 1000;

  let bootstrapPromise = null;
  let areaPromise = null;
  let occupationBootstrapPromise = null;

  function requireSarApi() {
    if (!window.SARAPI) throw new Error("Motor SAR indisponível.");
    return window.SARAPI;
  }

  function getSession() {
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  function setSession(value) {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
  }

  function readBox(key, ttlMs) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Number.isFinite(Number(parsed?.savedAt))) return null;
      if (Date.now() - Number(parsed.savedAt) > ttlMs) return null;
      return parsed.data ?? null;
    } catch (_) {
      return null;
    }
  }

  function writeBox(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) {}
  }

  function removeBox(key) {
    try { sessionStorage.removeItem(key); } catch (_) {}
  }

  function clearCachedState() { removeBox(STATE_KEY); }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    [STATE_KEY, STATIC_KEY, HEIGHT_KEY, SEARCH_KEY, REPORT_KEY].forEach(removeBox);
  }

  function saveState(data) {
    if (!data || typeof data !== "object") return;
    if (!Array.isArray(data.criterios) && !data.classificacao && data.implantacao_concluida === undefined) return;
    writeBox(STATE_KEY, data);
  }

  function getCachedState(maxAgeMs = STATE_TTL_MS) {
    return readBox(STATE_KEY, maxAgeMs);
  }

  function readStatic() {
    return readBox(STATIC_KEY, STATIC_TTL_MS) || {};
  }

  function mergeStatic(patch) {
    const next = { ...readStatic(), ...(patch || {}) };
    writeBox(STATIC_KEY, next);
    return next;
  }

  function readMap(key, ttlMs) {
    return readBox(key, ttlMs) || {};
  }

  function writeMap(key, map) { writeBox(key, map); }

  async function start() {
    clearSession();
    const data = await requireSarApi().post("/api/game/classificator/start", {});
    if (!data?.ok || !data?.sessao) throw new Error("Não foi possível iniciar o ClassificaTOR.");
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
    removeBox(REPORT_KEY);
    return data;
  }

  function invalidateHeightCache() { removeBox(HEIGHT_KEY); }
  function invalidateReportCache() { removeBox(REPORT_KEY); }

  async function answer(fase, opcao = null, dados = null) {
    const data = await postWithSession("/api/game/classificator/responder", { fase, opcao, dados });
    saveState(data);
    invalidateReportCache();
    if (String(fase || "").toUpperCase() === "FASE_04") invalidateHeightCache();
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

  async function bootstrap(options = {}) {
    const force = options?.force === true;
    if (!force) {
      const staticData = readStatic();
      const state = getCachedState();
      if (staticData?.area_config && staticData?.ocupacao && state) {
        return { ok: true, state, ...staticData };
      }
    }
    if (bootstrapPromise && !force) return bootstrapPromise;
    bootstrapPromise = postWithSession("/api/game/classificator/bootstrap", {})
      .then(data => {
        if (data?.state) saveState(data.state);
        mergeStatic({ area_config: data?.area_config || null, ocupacao: data?.ocupacao || null });
        return data;
      })
      .finally(() => { bootstrapPromise = null; });
    return bootstrapPromise;
  }

  async function prewarm() {
    if (!getSession()) return null;
    try { return await bootstrap(); } catch (_) { return null; }
  }

  async function areaConfiguration() {
    const cached = readStatic()?.area_config;
    if (cached) return { ok: true, ...cached };
    if (areaPromise) return areaPromise;
    areaPromise = postWithSession("/api/game/classificator/area/configuracao", {})
      .then(data => {
        if (data?.ok) {
          const { ok, ...config } = data;
          mergeStatic({ area_config: config });
        }
        return data;
      })
      .finally(() => { areaPromise = null; });
    return areaPromise;
  }

  async function alturaRequirement(dados = {}) {
    const areaCode = getCachedState()?.area?.resultado_codigo || getCachedState()?.area?.resultado_area_codigo || "SEM_AREA";
    const cacheKey = `${areaCode}|${JSON.stringify(dados || {})}`;
    const map = readMap(HEIGHT_KEY, HEIGHT_TTL_MS);
    if (map[cacheKey]) return map[cacheKey];
    const data = await postWithSession("/api/game/classificator/altura/necessidade", { dados });
    map[cacheKey] = data;
    writeMap(HEIGHT_KEY, map);
    return data;
  }

  async function report(options = {}) {
    if (options?.force !== true) {
      const cached = readBox(REPORT_KEY, REPORT_TTL_MS);
      if (cached) return cached;
    }
    const data = await postWithSession("/api/game/classificator/relatorio", {});
    writeBox(REPORT_KEY, data);
    return data;
  }

  async function occupationBootstrap() {
    const cached = readStatic()?.ocupacao;
    if (cached?.itens) return { ok: true, ...cached };
    if (occupationBootstrapPromise) return occupationBootstrapPromise;
    occupationBootstrapPromise = bootstrap()
      .then(data => ({ ok: true, ...(data?.ocupacao || readStatic()?.ocupacao || {}) }))
      .finally(() => { occupationBootstrapPromise = null; });
    return occupationBootstrapPromise;
  }

  async function occupationCatalog(params = {}) {
    const grupo = String(params?.grupo || "").trim();
    const busca = String(params?.busca || "").trim();
    const divisao = String(params?.divisao || "").trim();

    if (!busca) {
      const boot = await occupationBootstrap();
      const items = boot?.itens || [];
      if (divisao) {
        const item = items.find(x => String(x?.divisao || "").toUpperCase() === divisao.toUpperCase());
        if (item) {
          return {
            ok: true,
            item,
            perguntas: boot?.perguntas_por_divisao?.[divisao.toUpperCase()] || []
          };
        }
      }
      if (grupo) {
        return { ok: true, itens: items.filter(x => String(x?.grupo || "").toUpperCase() === grupo.toUpperCase()) };
      }
      return { ok: true, itens: items, perguntas_por_divisao: boot?.perguntas_por_divisao || {} };
    }

    const normalized = busca.toLocaleLowerCase("pt-BR");
    const key = `${grupo.toUpperCase()}|${normalized}`;
    const map = readMap(SEARCH_KEY, SEARCH_TTL_MS);
    if (map[key]) return map[key];
    const data = await postWithSession("/api/game/classificator/ocupacao/catalogo", { grupo, busca, divisao });
    map[key] = data;
    const keys = Object.keys(map);
    if (keys.length > 40) delete map[keys[0]];
    writeMap(SEARCH_KEY, map);
    return data;
  }

  async function restart() {
    if (!getSession()) return start();
    const data = await postWithSession("/api/game/classificator/reiniciar", {});
    [STATIC_KEY, HEIGHT_KEY, SEARCH_KEY, REPORT_KEY].forEach(removeBox);
    saveState(data);
    return data;
  }

  async function resetCriterion(criterio) {
    const codigo = String(criterio || "").trim().toUpperCase();
    if (!codigo) throw new Error("Critério inválido.");
    const data = await postWithSession("/api/game/classificator/criterio/reset", { criterio: codigo });
    saveState(data);
    invalidateReportCache();
    if (codigo === "AREA") invalidateHeightCache();
    return data;
  }

  window.SARClassificatorAPI = Object.freeze({
    start, restart, resetCriterion, selectState, answer, status, bootstrap, prewarm,
    report, areaConfiguration, alturaRequirement, occupationCatalog, occupationBootstrap,
    getSession, getCachedState, clearCachedState, clearSession
  });
})();
