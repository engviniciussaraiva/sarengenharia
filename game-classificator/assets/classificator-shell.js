(() => {
  "use strict";

  const host = document.querySelector("[data-classificator-header]");
  if (!host) return;

  const etapaExibida = String(host.dataset.stage || "").trim().toUpperCase();
  const rotulosFallback = [
    ["FASE_01","1","Implantação"],
    ["FASE_02","2","Tipologia da Edificação"],
    ["FASE_03","3","Ocupação"],
    ["FASE_04","4","Área"],
    ["FASE_05","5","Altura"],
    ["FASE_06","6","Demais Critérios"],
    ["RESULTADO","RESULTADO","Resultado"]
  ];

  host.innerHTML = `
    <div class="classificator-topbar">
      <div class="classificator-topbar-inner">
        <div>
          <p class="classificator-brand-title">Classifica<span>TOR</span></p>
          <p class="classificator-brand-sub">
            <span>Baseado conforme</span>
            <span>Instrução Técnica 42/2025 COBOMSP</span>
          </p>
        </div>

        <div class="classificator-progress-wrap">
          <p class="classificator-progress-label" id="classFaseAtual">Classificação</p>
          <div class="classificator-progress" id="classProgress"></div>
          <div class="classificator-current-caption" id="classFaseNome">Avanço da classificação</div>
        </div>

        <div class="classificator-result" aria-live="polite">
          <p class="classificator-result-title">Classificação atual</p>
          <div class="classificator-result-grid">
            <div class="classificator-result-card">
              <span class="classificator-result-label">Tipo de projeto</span>
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

  const progressEl = document.getElementById("classProgress");
  const faseAtualEl = document.getElementById("classFaseAtual");
  const faseNomeEl = document.getElementById("classFaseNome");
  const processoEl = document.getElementById("classProcesso");
  const certificacaoEl = document.getElementById("classCertificacao");
  const provisorioEl = document.getElementById("classProvisorio");

  function desenharNavegacao(lista = null) {
    const fonte = Array.isArray(lista) && lista.length
      ? lista
      : rotulosFallback.map(([codigo, label, titulo], i) => ({
          codigo,
          ordem:i + 1,
          titulo,
          rota:null,
          liberada: codigo === "FASE_01",
          respondida:false,
          nao_aplicavel:false,
          publicado: codigo === "FASE_01"
        }));

    progressEl.innerHTML = "";

    for (const etapa of fonte) {
      const ehResultado = etapa.codigo === "RESULTADO";
      const label = ehResultado ? "RESULTADO" : String(Math.trunc(Number(etapa.ordem)) || "");
      const atual = etapa.codigo === etapaExibida;
      const classes = ["classificator-step"];
      if (ehResultado) classes.push("result");
      if (etapa.respondida) classes.push("done");
      if (etapa.nao_aplicavel) classes.push("na");
      if (atual) classes.push("current");
      if (!etapa.liberada && !atual) classes.push("locked");

      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = classes.join(" ");
      botao.textContent = etapa.nao_aplicavel && !ehResultado ? "–" : label;
      botao.title = `${ehResultado ? "" : `Fase ${label} — `}${etapa.titulo || ""}${etapa.nao_aplicavel ? " (não aplicável)" : ""}`;
      botao.setAttribute("aria-label", botao.title);

      const podeNavegar = Boolean(etapa.liberada && etapa.rota && !etapa.nao_aplicavel && !atual);
      botao.disabled = !podeNavegar;
      if (podeNavegar) botao.addEventListener("click", () => window.location.assign(etapa.rota));
      progressEl.appendChild(botao);

      if (atual) {
        faseAtualEl.textContent = ehResultado ? "RESULTADO" : `FASE ${label}`;
        faseNomeEl.textContent = etapa.titulo || "Avanço da classificação";
      }
    }
  }

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
      provisorioEl.textContent = "Classificação em análise";
    }
  }

  async function carregarEstado() {
    try {
      const response = await fetch("/api/game/classificator/responder", {
        method:"GET",
        credentials:"same-origin",
        headers:{"Accept":"application/json"}
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.ok) return null;
      aplicarResumo(data.classificacao);
      desenharNavegacao(data.navegacao);
      window.dispatchEvent(new CustomEvent("sar:classificator-state", {detail:data}));
      return data;
    } catch (err) {
      console.debug("ClassificaTOR: estado ainda indisponível", err);
      return null;
    }
  }

  desenharNavegacao();

  window.SARClassificatorUI = {
    updateClassification: aplicarResumo,
    refreshClassification: carregarEstado,
    refreshState: carregarEstado
  };

  carregarEstado();
})();
