(() => {
  "use strict";

  const host = document.querySelector("[data-classificator-header]");
  if (!host) return;

  const faseTexto = String(host.dataset.phaseLabel || host.dataset.phase || "").trim();
  const faseNumero = Number(host.dataset.phase || 0);
  const total = 10;
  const ehAux2A = faseTexto.toUpperCase() === "2A";

  const sequencia = [];
  for (let n = 1; n <= total; n++) {
    sequencia.push({label:String(n), numero:n, aux:false});
    if (ehAux2A && n === 2) sequencia.push({label:"2A", numero:2.1, aux:true});
  }

  const atualNumero = ehAux2A ? 2.1 : faseNumero;
  const steps = sequencia.map(item => {
    const cls = item.numero < atualNumero ? "done" : (item.numero === atualNumero ? "current" : "");
    return `<span class="classificator-step ${item.aux ? "aux" : ""} ${cls}" aria-label="Fase ${item.label}">${item.label}</span>`;
  }).join("");

  host.innerHTML = `
    <div class="classificator-topbar">
      <div class="classificator-topbar-inner">
        <div>
          <p class="classificator-brand-title">Classifica<span>TOR</span></p>
          <p class="classificator-brand-sub">IT 42/2025 | Corpo de Bombeiros SP</p>
        </div>

        <div class="classificator-progress-wrap">
          <p class="classificator-progress-label">${faseTexto ? `FASE ${faseTexto}` : "CLASSIFICAÇÃO"}</p>
          <div class="classificator-progress ${ehAux2A ? "has-aux" : ""}">${steps}</div>
          <div class="classificator-current-caption">Avanço da classificação</div>
        </div>

        <div class="classificator-result" aria-live="polite">
          <p class="classificator-result-title">Classificação atual</p>
          <div class="classificator-result-grid">
            <div class="classificator-result-card">
              <span class="classificator-result-label">Processo</span>
              <span class="classificator-result-value" id="classProcesso">Em análise</span>
            </div>
            <div class="classificator-result-card">
              <span class="classificator-result-label">Certificação</span>
              <span class="classificator-result-value" id="classCertificacao">Em análise</span>
            </div>
          </div>
          <p class="classificator-result-provisional" id="classProvisorio">Resultado provisório durante o preenchimento</p>
        </div>
      </div>
    </div>`;

  const processoEl = document.getElementById("classProcesso");
  const certificacaoEl = document.getElementById("classCertificacao");
  const provisorioEl = document.getElementById("classProvisorio");

  function aplicarResumo(resumo) {
    const processo = resumo?.processo?.codigo || resumo?.processo?.texto || null;
    const certificacao = resumo?.certificacao?.codigo || resumo?.certificacao?.texto || null;

    processoEl.textContent = processo || "Em análise";
    certificacaoEl.textContent = certificacao || "Em análise";

    if (resumo?.provisorio === false) {
      provisorioEl.textContent = "Resultado final";
    } else if (processo || certificacao) {
      provisorioEl.textContent = "Resultado provisório — pode mudar nas próximas fases";
    } else {
      provisorioEl.textContent = "Classificação inicia a partir da Fase 2";
    }
  }

  async function carregarResumo() {
    try {
      const response = await fetch("/api/game/classificator/responder", {
        method: "GET",
        credentials: "same-origin",
        headers: {"Accept":"application/json"}
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.ok) aplicarResumo(data.classificacao);
    } catch (err) {
      console.debug("ClassificaTOR: resumo ainda indisponível", err);
    }
  }

  window.SARClassificatorUI = {
    updateClassification: aplicarResumo,
    refreshClassification: carregarResumo
  };

  carregarResumo();
})();
