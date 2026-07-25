<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Classificação da Edificação e Tipo de Certificação</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 30px auto;
    }
    h2 {
      color: #006400;
    }
    label {
      display: block;
      margin-top: 15px;
      font-weight: bold;
    }
    input[type="number"],
    input[type="text"],
    select {
      width: 100%;
      padding: 8px;
      box-sizing: border-box;
    }
    .bloco-descontos {
      margin-top: 10px;
      padding: 10px;
      background-color: #f2f2f2;
      border: 1px solid #ccc;
      border-radius: 6px;
    }
    .resposta {
      margin-top: 20px;
      padding: 15px;
      background: #f9f9f9;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-weight: bold;
    }
    button {
      padding: 8px 16px;
      margin-top: 20px;
      margin-right: 10px;
      cursor: pointer;
    }
    #infoAltura, #dadosDescricao {
      background: #eef;
      padding: 10px;
      margin-top: 10px;
      display: none;
    }
    fieldset label {
      margin-bottom: 4px;
      display: block;
    }
    fieldset select {
      margin-top: 2px;
      margin-bottom: 4px;
      padding: 4px;
    }
  </style>
</head>
<body>
  <h2>Classificação da Edificação e Tipo de Certificação</h2>

  <label>Área total edificada (m²):</label>
  <input type="number" id="areaTotal" oninput="calcularArea(); habilitarCampoIsolamento();">

  <div style="margin-top: 15px;">
    <input type="checkbox" id="mostrarDescontos" onchange="toggleDescontos()">
    <span style="font-weight: bold;">Deseja aplicar descontos permitidos pela IT-42/2025?</span>
  </div>

  <p id="infoDescontos" style="margin-top: 10px; font-weight: bold; color: #333;">
    Total de área desconsiderada: <span id="totalDescontadoSpan">0,00</span> m²
  </p>

  <div class="bloco-descontos" id="blocoDescontos" style="display: none;">
    <h4>Áreas a serem desconsideradas</h4>
    <label>Residência unifamiliar com acesso direto à rua (m²):</label><input type="number" class="descontar permitido" oninput="calcularArea()">
    <label>Piscinas (m²):</label><input type="number" class="descontar permitido" oninput="calcularArea()">
    <label>Cobertura de bombas (50% abertas) (m²):</label><input type="number" class="descontar permitido" oninput="calcularArea()">
    <label>Praça de pedágio (50% abertas) (m²):</label><input type="number" class="descontar permitido" oninput="calcularArea()">
    <label>Telheiros com laterais abertas (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
    <label>Platibandas e beirais (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
    <label>Passagens laterais abertas (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
    <label>Reservatórios (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
    <label>Escadas enclausuradas (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
    <label>Dutos de ventilação (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
    <label>Banheiros ou vestiários (m²):</label><input type="number" class="descontar nao-permitido" oninput="calcularArea()">
  </div>

  <label>Área computada (após descontos) (m²):</label>
  <input type="text" id="areaComputadaExibida" readonly style="background-color: #eee;">
  <input type="hidden" id="areaComputada">

  <!-- Fim da Parte 1 -->

  <!-- Início da Parte 2 -->

  <label>Tipologia da edificação em pavimentos:</label>
  <select id="pavimentos">
    <option value="">Selecione...</option>
    <option value="1">Um pavimento</option>
    <option value="2">Dois pavimentos</option>
    <option value="3">Três pavimentos</option>
    <option value="4">Mais de três pavimentos</option>
  </select>

  <label>Classificação da altura:</label>
  <select id="alturaClassificada" onchange="atualizarAlturaClassificada()">
    <option value="">Selecione...</option>
    <option value="I|Edificação Térrea|3">Um pavimento</option>
    <option value="II|Edificação Baixa|6">H ≤ 6,00 m</option>
    <option value="III|Edificação de Baixa-Média Altura|12">6,00 m < H ≤ 12,00 m</option>
    <option value="IV|Edificação de Média Altura|23">12,00 m < H ≤ 23,00 m</option>
    <option value="V|Edificação Mediatamente Alta|30">23,00 m < H ≤ 30,00 m</option>
    <option value="VI|Edificação Alta|100">Acima de 30,00 m</option>
  </select>

  <div id="infoAltura">
    <strong>Classificação Altura:</strong> Tipo <span id="tipoAltura"></span> – <span id="nomeAltura"></span>
  </div>

  <label>Ocupação / Uso:</label>
  <select id="grupo">
    <option value="">(simulado)</option>
  </select>

  <label>Descrição:</label>
  <select id="descricao">
    <option value="">(simulado)</option>
  </select>

  <div id="dadosDescricao">
    <strong>Divisão:</strong> <span id="divisao">A-2</span><br>
    <strong>Carga de Incêndio:</strong> <span id="carga">300</span> MJ/m²<br>
    <strong>Risco:</strong> <span id="risco">BAIXO</span>
  </div>

  <legend style="font-weight: bold; margin-top: 30px;">Critérios Técnicos Adicionais</legend>

  <div style="margin-bottom: 10px;">
    <label for="item412">Há mais de uma edificação no terreno que necessita de comprovação de isolamento de risco, mantendo-as com áreas individuais abaixo de 750,00 m²?</label>
    <select id="item412" style="width: 100%;" disabled>
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>

  <script>
    function habilitarCampoIsolamento() {
      const area = parseFloat(document.getElementById("areaTotal").value) || 0;
      document.getElementById("item412").disabled = area <= 750;
    }
  </script>

  <!-- Fim da Parte 2 -->
  <div style="margin-bottom: 10px;">
    <label>É destinada à comercialização ou revenda de gás liquefeito de petróleo (GLP)?</label>
    <select id="itemn" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Utiliza ou armazena mais que 190 kg de GLP?</label>
    <select id="itemo" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Armazena gases combustíveis em recipientes transportáveis ou estacionários?</label>
    <select id="itemp" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Armazena líquidos inflamáveis em quantidade superior a 1.000 L (exceto em tanques enterrados)?</label>
    <select id="itemq" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Possui instalação de processo com líquidos inflamáveis acima de 250 L?</label>
    <select id="itemr" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Possui produtos perigosos à saúde humana, meio ambiente ou patrimônio?</label>
    <select id="items" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Possui mais de 2.500 m² de área descoberta para materiais combustíveis?</label>
    <select id="itemt" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-top: 30px;">
    <button onclick="classificarEdificacao()">Classificar</button>
    <button onclick="limparCampos()">Limpar Tudo</button>
  </div>
  
  <div id="resultado" class="resposta"></div>
  
  <!-- Fim da Parte 3 -->
  <div style="margin-bottom: 10px;">
    <label>É destinada à comercialização ou revenda de gás liquefeito de petróleo (GLP)?</label>
    <select id="itemn" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Utiliza ou armazena mais que 190 kg de GLP?</label>
    <select id="itemo" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Armazena gases combustíveis em recipientes transportáveis ou estacionários?</label>
    <select id="itemp" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Armazena líquidos inflamáveis em quantidade superior a 1.000 L (exceto em tanques enterrados)?</label>
    <select id="itemq" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Possui instalação de processo com líquidos inflamáveis acima de 250 L?</label>
    <select id="itemr" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Possui produtos perigosos à saúde humana, meio ambiente ou patrimônio?</label>
    <select id="items" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-bottom: 10px;">
    <label>Possui mais de 2.500 m² de área descoberta para materiais combustíveis?</label>
    <select id="itemt" style="width: 100%;">
      <option value="">Selecione...</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
  
  <div style="margin-top: 30px;">
    <button onclick="classificarEdificacao()">Classificar</button>
    <button onclick="limparCampos()">Limpar Tudo</button>
  </div>
  
  <div id="resultado" class="resposta"></div>
  
  <!-- Fim da Parte 3 -->
  
  <!-- Início da Parte 4 -->
  
  <script>
  // Habilita o campo de isolamento apenas se a área for maior que 750 m²
  document.getElementById("areaTotal").addEventListener("input", function () {
    const area = parseFloat(this.value) || 0;
    const item412 = document.getElementById("item412");
    item412.disabled = !(area > 750);
    if (!item412.disabled) {
      item412.style.backgroundColor = "";
    } else {
      item412.selectedIndex = 0;
      item412.style.backgroundColor = "#eee";
    }
  });
  </script>
  
  <!-- Continuação da Parte 4 nas próximas seções -->
  
