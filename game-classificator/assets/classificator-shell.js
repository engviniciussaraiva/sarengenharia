(() => {
  "use strict";

  const host = document.querySelector("[data-classificator-header]");
  if (!host) return;

  const currentStage = String(host.dataset.stage || "").toUpperCase();
  const defaultCriteria = [
    {codigo:"AREA", titulo:"Área", rota:"/game-classificator/fase-04/", etapa:"FASE_04"},
    {codigo:"ALTURA", titulo:"Altura", rota:"/game-classificator/fase-03/", etapa:"FASE_03"},
    {codigo:"OCUPACAO", titulo:"Ocupação", rota:"/game-classificator/fase-05/", etapa:"FASE_05"},
    {codigo:"CRITERIOS", titulo:"Critérios", rota:"/game-classificator/fase-06/", etapa:"FASE_06"}
  ];

  const icons = {
    AREA:'<svg viewBox="0 0 24 24"><path d="M4 5l5-2 6 2 5-2v16l-5 2-6-2-5 2z"/><path d="M9 3v16M15 5v16"/></svg>',
    ALTURA:'<svg viewBox="0 0 24 24"><path d="M5 20V8h8v12zM8 8V4h5v4M17 5v14M15 7l2-2 2 2M15 17l2 2 2-2"/></svg>',
    OCUPACAO:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M6 20v-2a6 6 0 0112 0v2M4 10a3 3 0 00-2 3v3M20 10a3 3 0 012 3v3"/></svg>',
    CRITERIOS:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8l1.5 1.5L12 7M8 13l1.5 1.5L12 12M14 8h2M14 13h2"/></svg>'
  };

  host.innerHTML = `
    <div class="classificator-sticky">
      <div class="classificator-topbar">
        <div class="classificator-topbar-inner">
          <div>
            <p class="classificator-brand-title">Classifica<span>TOR</span></p>
            <p class="classificator-brand-sub"><span>Baseado conforme</span><span>Instrução Técnica 42/2025 COBOMSP</span></p>
          </div>
          <nav class="classificator-criteria" id="classCriteria" aria-label="Critérios do ClassificaTOR"></nav>
          <div class="classificator-result" aria-live="polite">
            <p class="classificator-result-title">Classificação atual</p>
            <div class="classificator-result-grid">
              <div class="classificator-result-card"><span class="classificator-result-label">Tipo de projeto</span><span class="classificator-result-value" id="classProcesso">Em análise</span></div>
              <div class="classificator-result-card"><span class="classificator-result-label">Certificação</span><span class="classificator-result-value" id="classCertificacao">Em análise</span></div>
            </div>
          </div>
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
  const processoEl = document.getElementById("classProcesso");
  const certificacaoEl = document.getElementById("classCertificacao");
  const ribbon = document.getElementById("classRibbon");
  const ribbonText = document.getElementById("classRibbonText");
  const ribbonButton = document.getElementById("classRibbonButton");

  function drawCriteria(criteria = defaultCriteria) {
    criteriaEl.innerHTML = "";
    for (const item of criteria) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "classificator-criterion";
      if (item.concluido) button.classList.add("done");
      if (item.etapa === currentStage) button.classList.add("current");
      if (item.rota) button.classList.add("clickable");
      button.innerHTML = `${icons[item.codigo] || ""}<span>${item.titulo}</span>`;
      button.title = item.concluido ? `${item.titulo}: determinado` : `${item.titulo}: não acessado`;
      if (item.rota) button.addEventListener("click", () => window.location.assign(item.rota));
      criteriaEl.appendChild(button);
    }
  }

  function applyClassification(summary) {
    const determinante = Boolean(summary?.determinante || summary?.provisorio === false);
    const processo = determinante ? (summary?.processo?.codigo || summary?.processo?.texto) : null;
    const certificacao = determinante ? (summary?.certificacao?.codigo || summary?.certificacao?.texto) : null;
    processoEl.textContent = processo || "Em análise";
    certificacaoEl.textContent = certificacao || "Em análise";

    if (determinante && processo && certificacao) {
      ribbon.classList.add("active");
      ribbonText.innerHTML = `<span><strong>Tipo de projeto:</strong> ${processo}</span><span><strong>Certificação:</strong> ${certificacao}</span><span>Resumo e direcionamentos</span>`;
    } else {
      ribbon.classList.remove("active");
      ribbonText.textContent = "";
    }
  }

  async function refresh() {
    try {
      const data = await window.SARClassificatorAPI?.status();
      if (!data?.ok) return null;
      drawCriteria(data.criterios || defaultCriteria);
      applyClassification(data.classificacao || null);
      ribbonButton.onclick = () => window.location.assign(data.resumo?.rota || "/game-classificator/resultado/");
      window.dispatchEvent(new CustomEvent("sar:classificator-state", {detail:data}));
      return data;
    } catch (error) {
      console.debug("ClassificaTOR: estado indisponível", error);
      drawCriteria(defaultCriteria);
      return null;
    }
  }

  drawCriteria();
  window.SARClassificatorUI = Object.freeze({refreshState:refresh, refreshClassification:refresh, updateClassification:applyClassification});
  refresh();
})();
