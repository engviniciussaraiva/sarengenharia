(() => {
  "use strict";

  const state = {
    currentFile: null,
    zoom: 1
  };

  const content = document.getElementById("sarDxfContent");
  const tabs = [...document.querySelectorAll(".sar-dxf-tab")];

  function showHome() {
    clearActiveTab();

    content.innerHTML = `
      <div class="sar-dxf-home">
        <div class="sar-dxf-home-inner">
          <h1>Automação DXF/CAD</h1>
          <p>Selecione uma automação acima.</p>
        </div>
      </div>
    `;
  }

  function clearActiveTab() {
    tabs.forEach(tab => tab.classList.remove("is-active"));
  }

  function activateTab(page) {
    clearActiveTab();
    const tab = tabs.find(item => item.dataset.page === page);
    if (tab) tab.classList.add("is-active");
  }

  function showFuture(title, description) {
    content.innerHTML = `
      <div class="sar-dxf-coming">
        <div>
          <h2>${title}</h2>
          <p>${description}</p>
        </div>
      </div>
    `;
  }

  function openPage(page) {
    activateTab(page);

    switch (page) {
      case "croqui":
        renderCroqui();
        break;
      case "pdf":
        showFuture("PDF → DXF", "Automação preparada para desenvolvimento futuro.");
        break;
      case "imagem":
        showFuture("Imagem → DXF", "Automação preparada para desenvolvimento futuro.");
        break;
      case "coordenadas":
        showFuture("Coordenadas → DXF", "Automação preparada para desenvolvimento futuro.");
        break;
      case "outras":
        showFuture("Outras Automações", "Novas automações DXF/CAD poderão ser adicionadas aqui.");
        break;
      default:
        showHome();
    }
  }

  function renderCroqui() {
    state.currentFile = null;
    state.zoom = 1;

    content.innerHTML = `
      <div class="sar-dxf-container">

        <header class="sar-dxf-header">
          <h1>Croqui → DXF</h1>
          <p>Converta um croqui ou rascunho em arquivo DXF editável.</p>
        </header>

        <div class="sar-dxf-grid">

          <div>

            <section class="sar-card">
              <div class="sar-card-header">
                <div class="sar-step">
                  <div class="sar-step-number">1</div>
                  <div>
                    <h2>Enviar croqui</h2>
                    <p>Envie um croqui, rascunho ou planta.</p>
                  </div>
                </div>
              </div>

              <div class="sar-card-body">
                <label class="sar-upload" for="sarCroquiFile">
                  <div class="sar-upload-icon">⇧</div>
                  <strong>Clique para selecionar um arquivo</strong>
                  <small>JPG, PNG ou PDF</small>
                </label>

                <input
                  id="sarCroquiFile"
                  class="sar-file-input"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                >

                <div id="sarSelectedFile" class="sar-file-box">
                  <div id="sarSelectedFileName" class="sar-file-name"></div>
                  <div id="sarSelectedFileInfo" class="sar-file-info"></div>
                </div>
              </div>
            </section>

            <section class="sar-card">
              <div class="sar-card-header">
                <div class="sar-step">
                  <div class="sar-step-number">2</div>
                  <div>
                    <h2>Medida de referência</h2>
                    <p>Informe uma medida real conhecida no croqui.</p>
                  </div>
                </div>
              </div>

              <div class="sar-card-body">
                <label class="sar-label" for="sarReferenceMeasure">Medida real</label>

                <div class="sar-form-row">
                  <input
                    id="sarReferenceMeasure"
                    class="sar-input sar-required"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex.: 4,00"
                  >

                  <select id="sarReferenceUnit" class="sar-select">
                    <option value="m">metros (m)</option>
                    <option value="cm">centímetros (cm)</option>
                    <option value="mm">milímetros (mm)</option>
                  </select>
                </div>

                <div class="sar-help">
                  Use uma medida claramente indicada no croqui, como o comprimento de uma parede.
                </div>
              </div>
            </section>

            <section class="sar-card">
              <div class="sar-card-header">
                <div class="sar-step">
                  <div class="sar-step-number">3</div>
                  <div>
                    <h2>Processar croqui</h2>
                    <p>O SAR irá interpretar o desenho e preparar a geometria.</p>
                  </div>
                </div>
              </div>

              <div class="sar-card-body">
                <button id="sarProcessButton" class="sar-btn sar-btn-primary">
                  Processar croqui
                </button>

                <div id="sarStatus" class="sar-status"></div>
              </div>
            </section>

            <section class="sar-card">
              <div class="sar-card-header">
                <div class="sar-step">
                  <div class="sar-step-number">4</div>
                  <div>
                    <h2>Gerar DXF</h2>
                    <p>Após a análise, gere o arquivo DXF editável.</p>
                  </div>
                </div>
              </div>

              <div class="sar-card-body">
                <button id="sarGenerateButton" class="sar-btn sar-btn-primary" disabled>
                  Gerar DXF
                </button>
              </div>
            </section>

          </div>

          <div>
            <section class="sar-card sar-preview-card">
              <div class="sar-preview-toolbar">
                <div class="sar-preview-title">Pré-visualização</div>

                <div class="sar-preview-actions">
                  <button id="sarZoomOut" type="button" title="Diminuir zoom">−</button>
                  <button id="sarZoomReset" type="button" title="Zoom 100%">100%</button>
                  <button id="sarZoomIn" type="button" title="Aumentar zoom">+</button>
                </div>
              </div>

              <div class="sar-preview">
                <div id="sarPreviewEmpty" class="sar-preview-empty">
                  <strong>Nenhum arquivo carregado</strong>
                  Envie um croqui para visualizar aqui.
                </div>

                <img id="sarPreviewImage" class="sar-preview-image" alt="Pré-visualização do croqui">
              </div>
            </section>
          </div>

        </div>
      </div>
    `;

    bindCroquiEvents();
  }

  function bindCroquiEvents() {
    document.getElementById("sarCroquiFile")
      .addEventListener("change", handleFile);

    document.getElementById("sarProcessButton")
      .addEventListener("click", processCroqui);

    document.getElementById("sarGenerateButton")
      .addEventListener("click", generateDXF);

    document.getElementById("sarZoomOut")
      .addEventListener("click", () => setZoom(state.zoom - 0.1));

    document.getElementById("sarZoomReset")
      .addEventListener("click", () => setZoom(1));

    document.getElementById("sarZoomIn")
      .addEventListener("click", () => setZoom(state.zoom + 0.1));
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    state.currentFile = file;

    const box = document.getElementById("sarSelectedFile");
    const name = document.getElementById("sarSelectedFileName");
    const info = document.getElementById("sarSelectedFileInfo");
    const image = document.getElementById("sarPreviewImage");
    const empty = document.getElementById("sarPreviewEmpty");

    box.classList.add("is-visible");
    name.textContent = file.name;
    info.textContent = formatFileSize(file.size);

    state.zoom = 1;
    image.style.transform = "scale(1)";

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();

      reader.onload = e => {
        image.src = e.target.result;
        image.classList.add("is-visible");
        empty.style.display = "none";
      };

      reader.readAsDataURL(file);
      return;
    }

    image.classList.remove("is-visible");
    image.removeAttribute("src");
    empty.style.display = "block";
    empty.innerHTML = `
      <strong>${escapeHtml(file.name)}</strong>
      PDF carregado. A leitura será feita quando o motor do backend for conectado.
    `;
  }

  function processCroqui() {
    const status = document.getElementById("sarStatus");
    const measure = Number(document.getElementById("sarReferenceMeasure").value);
    const unit = document.getElementById("sarReferenceUnit").value;

    status.classList.add("is-visible");

    if (!state.currentFile) {
      status.textContent = "Selecione primeiro um arquivo.";
      return;
    }

    if (!Number.isFinite(measure) || measure <= 0) {
      status.textContent = "Informe uma medida real de referência.";
      return;
    }

    status.textContent =
      `Tela validada: arquivo ${state.currentFile.name}, referência ${measure} ${unit}. ` +
      "O processamento real será conectado ao backend Railway na próxima etapa.";

    // V1: propositalmente NÃO habilita a geração real do DXF.
    // O botão será habilitado somente após resposta válida do backend.
  }

  function generateDXF() {
    // Endpoint futuro:
    // POST /api/automacao-dxf-cad/gerar-dxf
  }

  function setZoom(value) {
    state.zoom = Math.max(0.3, Math.min(2.5, value));

    const image = document.getElementById("sarPreviewImage");
    if (image) image.style.transform = `scale(${state.zoom})`;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => openPage(tab.dataset.page));
  });

  showHome();
})();
