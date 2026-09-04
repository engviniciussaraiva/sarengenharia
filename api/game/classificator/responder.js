import crypto from "node:crypto";

const COOKIE_NAME = "sar_classificator";

/*
 * ============================================================
 * GAME ClassificaTOR - EXECUTOR GENÉRICO DO MOTOR
 * ============================================================
 *
 * ESTE ARQUIVO NÃO CONTÉM REGRAS NORMATIVAS.
 *
 * O Supabase define:
 * - significado técnico de cada opção;
 * - campos aceitos em cada etapa;
 * - regras de classificação;
 * - condições das regras;
 * - prioridade de PROCESSO / CERTIFICAÇÃO;
 * - fluxo para a próxima tela;
 * - faixas de classificação de altura;
 * - mensagens.
 *
 * O código apenas:
 * 1) valida sessão;
 * 2) lê os dados do banco;
 * 3) avalia condições genericamente;
 * 4) recalcula todo o caso;
 * 5) grava o estado da sessão;
 * 6) devolve mensagem + próxima rota.
 * ============================================================
 */


/* ============================================================
 * SESSÃO
 * ============================================================ */

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const index = item.indexOf("=");
        if (index < 0) return [item, ""];
        return [item.slice(0, index), item.slice(index + 1)];
      })
  );
}

function assinar(valor, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(valor)
    .digest("base64url");
}

function assinaturasIguais(a, b) {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);

    if (ba.length !== bb.length) return false;

    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function validarSessao(req) {
  const secret = process.env.GAME_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw criarErro("CONFIG_SESSAO_AUSENTE");
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];

  if (!token) {
    throw criarErro("SESSAO_AUSENTE");
  }

  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    throw criarErro("SESSAO_INVALIDA");
  }

  const esperada = assinar(encoded, secret);

  if (!assinaturasIguais(signature, esperada)) {
    throw criarErro("SESSAO_INVALIDA");
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
  } catch {
    throw criarErro("SESSAO_INVALIDA");
  }

  const agora = Math.floor(Date.now() / 1000);

  if (
    payload.game !== "classificator" ||
    !payload.nonce ||
    !payload.exp ||
    payload.exp <= agora
  ) {
    throw criarErro("SESSAO_EXPIRADA");
  }

  return payload;
}


/* ============================================================
 * ERROS
 * ============================================================ */

function criarErro(codigo, detalhe = null) {
  const error = new Error(codigo);
  error.code = codigo;
  error.detalhe = detalhe;
  return error;
}


/* ============================================================
 * SUPABASE REST - SERVER SIDE
 * ============================================================ */

function configSupabase() {
  const url = process.env.GAME_SUPABASE_URL;
  const key = process.env.GAME_SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw criarErro("CONFIG_SUPABASE_AUSENTE");
  }

  return {
    baseUrl: url.replace(/\/+$/, ""),
    key
  };
}

async function restSelect(tabela, filtros = {}, select = "*") {
  const { baseUrl, key } = configSupabase();

  const params = new URLSearchParams();
  params.set("select", select);

  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === "") continue;
    params.set(campo, valor);
  }

  const endpoint =
    `${baseUrl}/rest/v1/${tabela}?${params.toString()}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "apikey": key,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const detalhe = await response.text();

    console.error(
      `GAME ClassificaTOR - SELECT ${tabela}:`,
      response.status,
      detalhe
    );

    throw criarErro("BANCO_CONSULTA_FALHOU");
  }

  return response.json();
}

async function restPatch(tabela, filtros = {}, body = {}) {
  const { baseUrl, key } = configSupabase();

  const params = new URLSearchParams();

  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === "") continue;
    params.set(campo, valor);
  }

  const endpoint =
    `${baseUrl}/rest/v1/${tabela}?${params.toString()}`;

  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "apikey": key,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detalhe = await response.text();

    console.error(
      `GAME ClassificaTOR - PATCH ${tabela}:`,
      response.status,
      detalhe
    );

    throw criarErro("BANCO_ATUALIZACAO_FALHOU");
  }
}


/* ============================================================
 * CONSULTAS DO MOTOR
 * ============================================================ */

async function obterSessao(sessionId) {
  const dados = await restSelect(
    "sar_game_classificator_sessoes",
    {
      session_id: `eq.${sessionId}`,
      limit: "1"
    },
    "session_id,fase_atual,estado,classificacao,expira_em"
  );

  if (!Array.isArray(dados) || !dados.length) {
    throw criarErro("SESSAO_NAO_ENCONTRADA");
  }

  const sessao = dados[0];

  if (
    sessao.expira_em &&
    new Date(sessao.expira_em).getTime() <= Date.now()
  ) {
    throw criarErro("SESSAO_EXPIRADA");
  }

  return sessao;
}

async function obterEtapasAtivas() {
  const dados = await restSelect(
    "sar_game_classificator_etapas",
    {
      ativo: "eq.true",
      order: "ordem.asc"
    },
    "etapa_codigo,ordem,titulo,rota,classifica,ativo,publicado"
  );

  return Array.isArray(dados) ? dados : [];
}

async function obterOpcao(etapaCodigo, opcaoCodigo) {
  const dados = await restSelect(
    "sar_game_classificator_opcoes",
    {
      etapa_codigo: `eq.${etapaCodigo}`,
      opcao_codigo: `eq.${opcaoCodigo}`,
      ativo: "eq.true",
      limit: "1"
    },
    "opcao_codigo,etapa_codigo,mensagem_codigo"
  );

  if (!Array.isArray(dados) || !dados.length) {
    throw criarErro("OPCAO_INVALIDA");
  }

  return dados[0];
}

async function etapaPossuiOpcoes(etapaCodigo) {
  const dados = await restSelect(
    "sar_game_classificator_opcoes",
    {
      etapa_codigo: `eq.${etapaCodigo}`,
      ativo: "eq.true",
      limit: "1"
    },
    "opcao_codigo"
  );

  return Array.isArray(dados) && dados.length > 0;
}

async function obterValoresOpcao(opcaoCodigo) {
  const dados = await restSelect(
    "sar_game_classificator_opcoes_valores",
    {
      opcao_codigo: `eq.${opcaoCodigo}`,
      order: "id.asc"
    },
    "campo,tipo_valor,valor_texto,valor_numero,valor_booleano"
  );

  return Array.isArray(dados) ? dados : [];
}

async function obterCamposEtapa(etapaCodigo) {
  const dados = await restSelect(
    "sar_game_classificator_campos",
    {
      etapa_codigo: `eq.${etapaCodigo}`,
      ativo: "eq.true",
      order: "id.asc"
    },
    "campo_codigo,tipo_valor,obrigatorio,valor_min_numero,valor_max_numero,casas_decimais"
  );

  return Array.isArray(dados) ? dados : [];
}

async function obterPrioridades(uf) {
  const dados = await restSelect(
    "sar_game_classificator_prioridades",
    {
      uf: `eq.${uf}`,
      ativo: "eq.true",
      order: "peso.asc"
    },
    "processo,modalidade,certificacao,peso,texto_processo,texto_certificacao,cor"
  );

  if (!Array.isArray(dados) || !dados.length) {
    throw criarErro("PRIORIDADE_NAO_CONFIGURADA");
  }

  return dados;
}

async function obterRegras(uf) {
  const regras = await restSelect(
    "sar_game_classificator_regras",
    {
      uf: `eq.${uf}`,
      ativo: "eq.true",
      order: "peso_referencia.asc.nullslast"
    },
    "regra_codigo,descricao,processo_minimo,modalidade,certificacao_minima,peso_referencia,criterio_determinante,fundamento,status_revisao"
  );

  if (!Array.isArray(regras) || !regras.length) {
    return [];
  }

  const codigos = regras
    .map(item => item.regra_codigo)
    .filter(Boolean);

  const condicoes = await restSelect(
    "sar_game_classificator_regras_condicoes",
    {
      regra_codigo: `in.(${codigos.join(",")})`,
      order: "regra_codigo.asc,grupo.asc,id.asc"
    },
    "regra_codigo,grupo,campo,operador,valor_texto,valor_numero,valor_booleano"
  );

  return regras.map(regra => ({
    ...regra,
    condicoes: Array.isArray(condicoes)
      ? condicoes.filter(c => c.regra_codigo === regra.regra_codigo)
      : []
  }));
}

async function obterFluxos(uf, etapaCodigo) {
  const fluxos = await restSelect(
    "sar_game_classificator_fluxos",
    {
      uf: `eq.${uf}`,
      etapa_atual: `eq.${etapaCodigo}`,
      ativo: "eq.true",
      order: "prioridade.desc,fluxo_codigo.asc"
    },
    "fluxo_codigo,etapa_atual,proxima_etapa,prioridade,mensagem_codigo,descricao"
  );

  if (!Array.isArray(fluxos) || !fluxos.length) {
    return [];
  }

  const codigos = fluxos
    .map(item => item.fluxo_codigo)
    .filter(Boolean);

  const condicoes = await restSelect(
    "sar_game_classificator_fluxos_condicoes",
    {
      fluxo_codigo: `in.(${codigos.join(",")})`,
      order: "fluxo_codigo.asc,grupo.asc,id.asc"
    },
    "fluxo_codigo,grupo,campo,operador,valor_texto,valor_numero,valor_booleano"
  );

  return fluxos.map(fluxo => ({
    ...fluxo,
    condicoes: Array.isArray(condicoes)
      ? condicoes.filter(c => c.fluxo_codigo === fluxo.fluxo_codigo)
      : []
  }));
}

async function obterClassificacaoAltura(uf, altura) {
  const faixas = await restSelect(
    "sar_game_classificator_altura_classificacao",
    {
      uf: `eq.${uf}`,
      ativo: "eq.true",
      order: "id.asc"
    },
    "altura_min_exclusiva,altura_max_inclusiva,tipo_altura,denominacao,texto_altura"
  );

  const valor = Number(altura);

  if (!Number.isFinite(valor)) {
    throw criarErro("ALTURA_INVALIDA");
  }

  const faixa = (Array.isArray(faixas) ? faixas : [])
    .filter(item =>
      item.altura_min_exclusiva !== null ||
      item.altura_max_inclusiva !== null
    )
    .find(item => {
      const minOk =
        item.altura_min_exclusiva === null ||
        valor > Number(item.altura_min_exclusiva);

      const maxOk =
        item.altura_max_inclusiva === null ||
        valor <= Number(item.altura_max_inclusiva);

      return minOk && maxOk;
    });

  if (!faixa) {
    throw criarErro("FAIXA_ALTURA_NAO_ENCONTRADA");
  }

  return faixa;
}

async function buscarMensagem(codigo) {
  if (!codigo) return "";

  const dados = await restSelect(
    "sar_game_classificator_mensagens",
    {
      codigo: `eq.${codigo}`,
      ativo: "eq.true",
      limit: "1"
    },
    "texto"
  );

  if (!Array.isArray(dados) || !dados.length || !dados[0]?.texto) {
    return "";
  }

  return String(dados[0].texto).trim();
}


/* ============================================================
 * CONVERSÕES E VALIDAÇÃO ORIENTADAS A DADOS
 * ============================================================ */

function normalizarEtapa(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

function normalizarOpcao(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase();
}

function valorDaLinha(linha) {
  const tipo = String(linha.tipo_valor || "").toLowerCase();

  if (tipo === "numero") {
    return linha.valor_numero === null
      ? null
      : Number(linha.valor_numero);
  }

  if (tipo === "booleano") {
    return linha.valor_booleano === null
      ? null
      : Boolean(linha.valor_booleano);
  }

  return linha.valor_texto === null
    ? null
    : String(linha.valor_texto);
}

function converterCampo(definicao, valorBruto) {
  const tipo = String(definicao.tipo_valor || "").toLowerCase();

  if (tipo === "numero") {
    const valor = Number(valorBruto);

    if (!Number.isFinite(valor)) {
      throw criarErro("CAMPO_INVALIDO", definicao.campo_codigo);
    }

    if (
      definicao.valor_min_numero !== null &&
      valor < Number(definicao.valor_min_numero)
    ) {
      throw criarErro("CAMPO_ABAIXO_MINIMO", definicao.campo_codigo);
    }

    if (
      definicao.valor_max_numero !== null &&
      valor > Number(definicao.valor_max_numero)
    ) {
      throw criarErro("CAMPO_ACIMA_MAXIMO", definicao.campo_codigo);
    }

    return valor;
  }

  if (tipo === "booleano") {
    if (valorBruto === true || valorBruto === false) {
      return valorBruto;
    }

    if (valorBruto === "true") return true;
    if (valorBruto === "false") return false;

    throw criarErro("CAMPO_INVALIDO", definicao.campo_codigo);
  }

  const valor = String(valorBruto ?? "").trim();

  if (definicao.obrigatorio && !valor) {
    throw criarErro("CAMPO_OBRIGATORIO", definicao.campo_codigo);
  }

  return valor;
}

function validarDadosDigitados(dados, definicoes) {
  const entrada =
    dados && typeof dados === "object" && !Array.isArray(dados)
      ? dados
      : {};

  const mapa = new Map(
    definicoes.map(item => [item.campo_codigo, item])
  );

  for (const campo of Object.keys(entrada)) {
    if (!mapa.has(campo)) {
      throw criarErro("CAMPO_NAO_PERMITIDO", campo);
    }
  }

  const saida = {};

  for (const definicao of definicoes) {
    const temValor = Object.prototype.hasOwnProperty.call(
      entrada,
      definicao.campo_codigo
    );

    if (!temValor) {
      if (definicao.obrigatorio) {
        throw criarErro("CAMPO_OBRIGATORIO", definicao.campo_codigo);
      }
      continue;
    }

    saida[definicao.campo_codigo] = converterCampo(
      definicao,
      entrada[definicao.campo_codigo]
    );
  }

  return saida;
}


/* ============================================================
 * AVALIADOR GENÉRICO DE CONDIÇÕES
 * ============================================================ */

function valorEsperado(condicao) {
  if (condicao.valor_booleano !== null) {
    return Boolean(condicao.valor_booleano);
  }

  if (condicao.valor_numero !== null) {
    return Number(condicao.valor_numero);
  }

  if (condicao.valor_texto !== null) {
    return String(condicao.valor_texto);
  }

  return null;
}

function comparar(valorAtual, operadorBruto, esperado) {
  const operador = String(operadorBruto || "")
    .trim()
    .toUpperCase();

  if (operador === "IS_NULL") {
    return valorAtual === null || valorAtual === undefined || valorAtual === "";
  }

  if (operador === "NOT_NULL") {
    return !(valorAtual === null || valorAtual === undefined || valorAtual === "");
  }

  if (valorAtual === undefined || valorAtual === null) {
    return false;
  }

  if (operador === "=") return valorAtual === esperado;
  if (operador === "!=") return valorAtual !== esperado;

  if (operador === ">") return Number(valorAtual) > Number(esperado);
  if (operador === ">=") return Number(valorAtual) >= Number(esperado);
  if (operador === "<") return Number(valorAtual) < Number(esperado);
  if (operador === "<=") return Number(valorAtual) <= Number(esperado);

  if (operador === "IN" || operador === "NOT_IN") {
    const lista = Array.isArray(esperado)
      ? esperado
      : String(esperado ?? "")
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);

    const existe = lista.includes(String(valorAtual));

    return operador === "IN" ? existe : !existe;
  }

  throw criarErro("OPERADOR_NAO_SUPORTADO", operador);
}

function condicoesAtendidas(condicoes, respostas) {
  if (!Array.isArray(condicoes) || condicoes.length === 0) {
    return true;
  }

  const grupos = new Map();

  for (const condicao of condicoes) {
    const grupo = Number(condicao.grupo || 1);

    if (!grupos.has(grupo)) {
      grupos.set(grupo, []);
    }

    grupos.get(grupo).push(condicao);
  }

  // Dentro do grupo: AND.
  // Entre grupos: OR.
  return Array.from(grupos.values()).some(grupoCondicoes =>
    grupoCondicoes.every(condicao =>
      comparar(
        respostas[condicao.campo],
        condicao.operador,
        valorEsperado(condicao)
      )
    )
  );
}


/* ============================================================
 * RECONSTRUÇÃO DO ESTADO
 * ============================================================ */

function mapaEtapas(etapas) {
  return new Map(
    etapas.map(item => [item.etapa_codigo, item])
  );
}

function limparEtapasPosteriores(
  respostasPorEtapa,
  etapaAtual,
  etapas
) {
  const mapa = mapaEtapas(etapas);
  const atual = mapa.get(etapaAtual);

  if (!atual) {
    throw criarErro("ETAPA_NAO_ENCONTRADA");
  }

  const copia = {
    ...(respostasPorEtapa || {})
  };

  for (const codigo of Object.keys(copia)) {
    const etapa = mapa.get(codigo);

    if (
      etapa &&
      Number(etapa.ordem) > Number(atual.ordem)
    ) {
      delete copia[codigo];
    }
  }

  return copia;
}

function consolidarRespostas(respostasPorEtapa, etapas) {
  const ordenadas = [...etapas].sort(
    (a, b) => Number(a.ordem) - Number(b.ordem)
  );

  const saida = {};

  for (const etapa of ordenadas) {
    const dados = respostasPorEtapa?.[etapa.etapa_codigo];

    if (
      dados &&
      typeof dados === "object" &&
      !Array.isArray(dados)
    ) {
      Object.assign(saida, dados);
    }
  }

  return saida;
}

function validarSequencia(etapaAtual, etapas, estado) {
  const mapa = mapaEtapas(etapas);
  const atual = mapa.get(etapaAtual);

  if (!atual || !atual.classifica) {
    throw criarErro("ETAPA_NAO_PERMITIDA");
  }

  const primeiraClassificatoria = etapas
    .filter(item => item.classifica)
    .sort((a, b) => Number(a.ordem) - Number(b.ordem))[0];

  const proximaEsperada = estado?.motor?.proxima_etapa || null;

  if (!proximaEsperada) {
    if (
      !primeiraClassificatoria ||
      etapaAtual !== primeiraClassificatoria.etapa_codigo
    ) {
      throw criarErro("SEQUENCIA_INVALIDA");
    }

    return;
  }

  const esperada = mapa.get(proximaEsperada);

  if (!esperada) {
    return;
  }

  // Permite voltar e corrigir etapa anterior.
  // Não permite pular etapa para frente.
  if (Number(atual.ordem) > Number(esperada.ordem)) {
    throw criarErro("SEQUENCIA_INVALIDA");
  }
}


/* ============================================================
 * MOTOR DE CLASSIFICAÇÃO
 * ============================================================ */

function recalcularClassificacao(respostas, prioridades, regras) {
  const prioridadesOrdenadas = [...prioridades]
    .sort((a, b) => Number(a.peso) - Number(b.peso));

  const base = prioridadesOrdenadas[0];

  if (!base) {
    throw criarErro("PRIORIDADE_NAO_CONFIGURADA");
  }

  const aplicadas = [];
  let maiorPeso = Number(base.peso);

  for (const regra of regras) {
    if (!condicoesAtendidas(regra.condicoes, respostas)) {
      continue;
    }

    if (
      regra.peso_referencia === null ||
      regra.peso_referencia === undefined
    ) {
      continue;
    }

    const peso = Number(regra.peso_referencia);

    if (!Number.isFinite(peso)) {
      continue;
    }

    maiorPeso = Math.max(maiorPeso, peso);

    aplicadas.push({
      regra_codigo: regra.regra_codigo,
      peso,
      criterio: regra.criterio_determinante || null,
      fundamento: regra.fundamento || null,
      descricao: regra.descricao || null
    });
  }

  const resultado = prioridadesOrdenadas.find(
    item => Number(item.peso) === maiorPeso
  );

  if (!resultado) {
    throw criarErro("RESULTADO_PRIORIDADE_NAO_ENCONTRADO");
  }

  return {
    status: "EM_ANDAMENTO",
    processo: {
      codigo: resultado.processo,
      modalidade: resultado.modalidade,
      texto: resultado.texto_processo
    },
    certificacao: {
      codigo: resultado.certificacao,
      texto: resultado.texto_certificacao
    },
    peso: Number(resultado.peso),
    cor: resultado.cor || null,
    regras_aplicadas: aplicadas,
    atualizado_em: new Date().toISOString()
  };
}


/* ============================================================
 * MOTOR DE NAVEGAÇÃO
 * ============================================================ */

function resolverFluxo(fluxos, respostas) {
  const aplicavel = [...fluxos]
    .sort((a, b) => {
      const diff = Number(b.prioridade) - Number(a.prioridade);
      if (diff !== 0) return diff;
      return String(a.fluxo_codigo).localeCompare(String(b.fluxo_codigo));
    })
    .find(fluxo =>
      condicoesAtendidas(fluxo.condicoes, respostas)
    );

  if (!aplicavel) {
    throw criarErro("FLUXO_NAO_ENCONTRADO");
  }

  return aplicavel;
}


/* ============================================================
 * PERSISTÊNCIA
 * ============================================================ */

async function atualizarSessao(
  sessionId,
  faseAtual,
  estado,
  classificacao
) {
  await restPatch(
    "sar_game_classificator_sessoes",
    {
      session_id: `eq.${sessionId}`
    },
    {
      fase_atual: faseAtual,
      estado,
      classificacao,
      atualizado_em: new Date().toISOString()
    }
  );
}




/* ============================================================
 * CLASSIFICAÇÃO PÚBLICA PARA O CABEÇALHO
 * Não expõe regras, fundamentos ou critérios internos.
 * ============================================================ */

function resumoPublicoClassificacao(classificacao) {
  const processo = classificacao?.processo || null;
  const certificacao = classificacao?.certificacao || null;

  if (!processo?.codigo || !certificacao?.codigo) {
    return {
      status: "EM_ANALISE",
      provisorio: true,
      processo: { codigo: null, texto: "Em análise" },
      certificacao: { codigo: null, texto: "Em análise" }
    };
  }

  return {
    status: classificacao?.status || "EM_ANDAMENTO",
    provisorio: classificacao?.status !== "FINAL",
    processo: {
      codigo: processo.codigo,
      texto: processo.texto || processo.codigo
    },
    certificacao: {
      codigo: certificacao.codigo,
      texto: certificacao.texto || certificacao.codigo
    }
  };
}


/* ============================================================
 * HANDLER
 * ============================================================ */

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      ok: false,
      erro: "METODO_NAO_PERMITIDO"
    });
  }

  try {
    const token = validarSessao(req);
    const sessao = await obterSessao(token.nonce);

    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        fase_atual: sessao.fase_atual || null,
        classificacao: resumoPublicoClassificacao(sessao.classificacao)
      });
    }

    const uf = String(
      sessao.estado?.jurisdicao?.uf || ""
    )
      .trim()
      .toUpperCase();

    if (!uf) {
      return res.status(409).json({
        ok: false,
        erro: "JURISDICAO_NAO_DEFINIDA"
      });
    }

    const etapaCodigo = normalizarEtapa(req.body?.fase);
    const opcaoCodigo = normalizarOpcao(req.body?.opcao);
    const dadosBrutos = req.body?.dados;

    const etapas = await obterEtapasAtivas();
    const etapaMap = mapaEtapas(etapas);
    const etapa = etapaMap.get(etapaCodigo);

    if (!etapa || !etapa.classifica) {
      return res.status(400).json({
        ok: false,
        erro: "ETAPA_NAO_PERMITIDA"
      });
    }

    validarSequencia(
      etapaCodigo,
      etapas,
      sessao.estado || {}
    );

    const valoresEtapa = {};
    let mensagemCodigo = null;

    const possuiOpcoes = await etapaPossuiOpcoes(etapaCodigo);

    if (possuiOpcoes && !opcaoCodigo) {
      return res.status(400).json({
        ok: false,
        erro: "OPCAO_AUSENTE"
      });
    }

    if (opcaoCodigo) {
      const opcao = await obterOpcao(
        etapaCodigo,
        opcaoCodigo
      );

      const valores = await obterValoresOpcao(
        opcaoCodigo
      );

      for (const linha of valores) {
        valoresEtapa[linha.campo] = valorDaLinha(linha);
      }

      mensagemCodigo = opcao.mensagem_codigo || null;
    }

    const definicoesCampos = await obterCamposEtapa(
      etapaCodigo
    );

    const dadosValidados = validarDadosDigitados(
      dadosBrutos,
      definicoesCampos
    );

    Object.assign(valoresEtapa, dadosValidados);

    // Derivação da faixa de altura usando limites mantidos no banco.
    if (Object.prototype.hasOwnProperty.call(valoresEtapa, "altura_m")) {
      const faixaAltura = await obterClassificacaoAltura(
        uf,
        valoresEtapa.altura_m
      );

      valoresEtapa.tipo_altura = faixaAltura.tipo_altura;
      valoresEtapa.denominacao_altura = faixaAltura.denominacao;
      valoresEtapa.texto_altura = faixaAltura.texto_altura;
    }

    const respostasPorEtapa = limparEtapasPosteriores(
      sessao.estado?.respostas_por_etapa || {},
      etapaCodigo,
      etapas
    );

    respostasPorEtapa[etapaCodigo] = valoresEtapa;

    const respostas = consolidarRespostas(
      respostasPorEtapa,
      etapas
    );

    const [prioridades, regras, fluxos] = await Promise.all([
      obterPrioridades(uf),
      obterRegras(uf),
      obterFluxos(uf, etapaCodigo)
    ]);

    const classificacao = recalcularClassificacao(
      respostas,
      prioridades,
      regras
    );

    const fluxo = resolverFluxo(
      fluxos,
      respostas
    );

    const proximaEtapa = etapaMap.get(
      fluxo.proxima_etapa
    );

    if (!proximaEtapa) {
      throw criarErro("PROXIMA_ETAPA_NAO_CONFIGURADA");
    }

    if (!mensagemCodigo) {
      mensagemCodigo = fluxo.mensagem_codigo || null;
    }

    const mensagem = await buscarMensagem(
      mensagemCodigo
    );

    const agora = new Date().toISOString();

    const novoEstado = {
      ...(sessao.estado || {}),

      respostas_por_etapa: respostasPorEtapa,
      respostas,

      motor: {
        etapa_processada: etapaCodigo,
        proxima_etapa: proximaEtapa.etapa_codigo,
        fluxo_codigo: fluxo.fluxo_codigo,
        atualizado_em: agora
      },

      ultima_resposta: {
        etapa: etapaCodigo,
        opcao: opcaoCodigo || null,
        registrada_em: agora
      }
    };

    await atualizarSessao(
      token.nonce,
      proximaEtapa.etapa_codigo,
      novoEstado,
      classificacao
    );

    // A próxima rota só é entregue quando a tela estiver publicada.
    // Assim o motor pode ser instalado antes da criação da próxima tela.
    const next =
      proximaEtapa.ativo && proximaEtapa.publicado
        ? proximaEtapa.rota
        : null;

    // Resposta pública mínima: não expõe regras, fundamentos ou critérios internos.
    // Envia apenas o resultado provisório necessário ao cabeçalho visual.
    return res.status(200).json({
      ok: true,
      mensagem,
      next,
      classificacao: resumoPublicoClassificacao(classificacao)
    });

  } catch (error) {
    console.error(
      "GAME ClassificaTOR - responder:",
      error
    );

    const errosSessao = new Set([
      "SESSAO_AUSENTE",
      "SESSAO_INVALIDA",
      "SESSAO_EXPIRADA",
      "SESSAO_NAO_ENCONTRADA"
    ]);

    if (errosSessao.has(error.code)) {
      return res.status(401).json({
        ok: false,
        erro: error.code
      });
    }

    const errosUsuario = new Set([
      "ETAPA_NAO_PERMITIDA",
      "SEQUENCIA_INVALIDA",
      "OPCAO_AUSENTE",
      "OPCAO_INVALIDA",
      "CAMPO_NAO_PERMITIDO",
      "CAMPO_INVALIDO",
      "CAMPO_OBRIGATORIO",
      "CAMPO_ABAIXO_MINIMO",
      "CAMPO_ACIMA_MAXIMO",
      "ALTURA_INVALIDA"
    ]);

    if (errosUsuario.has(error.code)) {
      return res.status(400).json({
        ok: false,
        erro: error.code
      });
    }

    return res.status(500).json({
      ok: false,
      erro: "ERRO_INTERNO"
    });
  }
}
