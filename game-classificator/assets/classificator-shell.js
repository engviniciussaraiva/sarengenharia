(() => {
  "use strict";

  const host = document.querySelector("[data-classificator-header]");
  if (!host) return;

  const currentStage = String(host.dataset.stage || "").toUpperCase();
  const HOME_ROUTE = "/game-classificator/fase-01/";

  const defaultCriteria = [
    {codigo:"AREA", titulo:"Área", rota:"/game-classificator/fase-04/", etapa:"FASE_04", concluido:false, habilitado:false},
    {codigo:"ALTURA", titulo:"Altura", rota:"/game-classificator/fase-03/", etapa:"FASE_03", concluido:false, habilitado:false},
    {codigo:"OCUPACAO", titulo:"Ocupação", rota:"/game-classificator/fase-05/", etapa:"FASE_05", concluido:false, habilitado:false},
    {codigo:"CRITERIOS", titulo:"Critérios", rota:"/game-classificator/fase-06/", etapa:"FASE_06", concluido:false, habilitado:false}
  ];

  const icons = {
    HOME:'<svg viewBox="0 0 24 24"><path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/></svg>',
    AREA:'<svg viewBox="0 0 24 24"><path d="M4 5l5-2 6 2 5-2v16l-5 2-6-2-5 2z"/><path d="M9 3v16M15 5v16"/></svg>',
    ALTURA:'<svg viewBox="0 0 24 24"><path d="M5 20V8h8v12zM8 8V4h5v4M17 5v14M15 7l2-2 2 2M15 17l2 2 2-2"/></svg>',
    OCUPACAO:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M6 20v-2a6 6 0 0112 0v2M4 10a3 3 0 00-2 3v3M20 10a3 3 0 012 3v3"/></svg>',
    CRITERIOS:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8l1.5 1.5L12 7M8 13l1.5 1.5L12 12M14 8h2M14 13h2"/></svg>'
  };

  host.innerHTML = `
    <div class="classificator-sticky">
      <div class="classificator-topbar">
        <div class="classificator-topbar-inner">
          <div class="classificator-brand">
            <p class="classificator-brand-title">Classifica<span>TOR</span></p>
            <p class="classificator-brand-sub"><span>Baseado conforme</span><span>Instrução Técnica 42/2025 COBOMSP</span></p>
          </div>
          <nav class="classificator-criteria" id="classCriteria" aria-label="Navegação do ClassificaTOR"></nav>
        </div>
      </div>
      <div class="classificator-result-ribbon" id="classRibbon">
        <button type="button" id="classRibbonButton" aria-label="Abrir resumo da classificação">
          <span class="classificator-result-ribbon-inner">
            <span class="classificator-result-ribbon-mark">i</span>
            <span class="classificator-result-ribbon-text" id="classRibbonText"></span>
            <span class="classificator-result-ribbon-arrow">›</span>
          </span>
        </button>
      </div>
    </div>`;

  const criteriaEl = document.getElementById("classCriteria");
  const ribbon = document.getElementById("classRibbon");
  const ribbonText = document.getElementById("classRibbonText");
  const ribbonButton = document.getElementById("classRibbonButton");

  let lastState = null;
  let restartBusy = false;

  async function restartStudy(button) {
    if (restartBusy) return;
    restartBusy = true;
    if (button) button.disabled = true;
    try {
      const data = await window.SARClassificatorAPI?.restart();
      if (!data?.ok) throw new Error("Não foi possível reiniciar o ClassificaTOR.");
      window.location.assign(data.next || HOME_ROUTE);
    } catch (error) {
      console.error("ClassificaTOR: falha ao reiniciar", error);
      if (button) button.disabled = false;
      restartBusy = false;
      window.alert(error?.message || "Não foi possível iniciar um novo estudo.");
    }
  }

  function drawCriteria(criteria = defaultCriteria, implantationDone = false) {
    criteriaEl.innerHTML = "";

    const home = document.createElement("button");
    home.type = "button";
    home.className = "classificator-criterion classificator-home clickable";
    if (currentStage === "FASE_01") home.classList.add("current-home");
    home.innerHTML = `${icons.HOME}<span>Início</span>`;
    home.title = "Reiniciar o estudo e voltar para Implantação";
    home.addEventListener("click", () => restartStudy(home));
    criteriaEl.appendChild(home);

    for (const item of criteria) {
      const enabled = item.habilitado === true || (item.habilitado === undefined && implantationDone === true);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "classificator-criterion";
      button.disabled = !enabled;

      if (item.concluido) button.classList.add("done");
      if (enabled && item.etapa === currentStage) button.classList.add("current");
      if (enabled && item.rota) button.classList.add("clickable");
      if (!enabled) button.classList.add("locked");

      button.innerHTML = `${icons[item.codigo] || ""}<span>${item.titulo}</span>`;
      button.title = !enabled
        ? `${item.titulo}: disponível após definir a implantação`
        : item.concluido
          ? `${item.titulo}: determinado`
          : `${item.titulo}: disponível`;

      if (enabled && item.rota) {
        button.addEventListener("click", () => window.location.assign(item.rota));
      }
      criteriaEl.appendChild(button);
    }
  }

  function applyClassification(summary) {
    const determinante = Boolean(summary?.determinante || summary?.provisorio === false);
    const processo = determinante ? (summary?.processo?.codigo || summary?.processo?.texto) : null;
    const certificacao = determinante ? (summary?.certificacao?.codigo || summary?.certificacao?.texto) : null;

    if (determinante && processo && certificacao) {
      ribbon.classList.add("active");
      document.documentElement.classList.add("classificator-has-result");
      ribbonText.innerHTML = `
        <span><strong>Tipo de projeto:</strong> ${processo}</span>
        <span><strong>Certificação:</strong> ${certificacao}</span>
        <span>Resumo e direcionamentos</span>`;
    } else {
      ribbon.classList.remove("active");
      document.documentElement.classList.remove("classificator-has-result");
      ribbonText.textContent = "";
    }
  }

  function applyState(data) {
    if (!data || data.ok === false) return null;
    lastState = data;
    const implantationDone = data.implantacao_concluida === true;
    if (!implantationDone && ["FASE_03","FASE_04","FASE_05","FASE_06"].includes(currentStage)) {
      window.location.replace(HOME_ROUTE);
      return data;
    }
    drawCriteria(data.criterios || defaultCriteria, implantationDone);
    applyClassification(data.classificacao || null);
    ribbonButton.onclick = () => window.location.assign(data.resumo?.rota || "/game-classificator/resultado/");
    window.dispatchEvent(new CustomEvent("sar:classificator-state", {detail:data}));
    return data;
  }

  async function refresh(options = {}) {
    try {
      const data = await window.SARClassificatorAPI?.status(options);
      return applyState(data);
    } catch (error) {
      console.debug("ClassificaTOR: estado indisponível", error);
      drawCriteria(defaultCriteria, false);
      applyClassification(null);
      return null;
    }
  }

  /* Desenha imediatamente sem aguardar rede. */
  drawCriteria(defaultCriteria, false);

  /* status() usa o cache local quando ele estiver recente. */
  refresh();

  window.SARClassificatorUI = Object.freeze({
    refreshState: refresh,
    refreshClassification: refresh,
    updateClassification: applyClassification,
    applyState,
    getState: () => lastState
  });
})();
