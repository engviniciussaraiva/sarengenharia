import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ============================================================
   SAR CMS V2
   Arquivo único do motor público do site.
   Substitua todo o conteúdo antigo de js/site-cms.js por este.
   ============================================================ */

const SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co";
const SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const SLUG_PAGINA =
  document.body?.dataset?.pagina ||
  document.documentElement?.dataset?.pagina ||
  "home";

const ICONES = {
  brain: "🧠",
  clipboard: "📋",
  repeat: "🔁",
  droplet: "💧",
  water: "💧",
  calculator: "🧮",
  wrench: "🔧",
  settings: "⚙️",
  gear: "⚙️",
  printer: "🖨️",
  cube: "🧊",
  building: "🏢",
  stairs: "🪜",
  fire: "🔥",
  flame: "🔥",
  pump: "⚙️",
  book: "📚",
  library: "📚",
  database: "🗄️",
  shield: "🛡️",
  lock: "🔒",
  chart: "📊",
  home: "🏠",
  project: "📐",
  ruler: "📏",
  pipe: "🔩",
  conversion: "🔄",
  globe: "🌐",
  support: "🎧",
  email: "✉️",
  mail: "✉️",
  whatsapp: "💬",
  phone: "☎️",
  telefone: "☎️",
  site: "🌐",
  linkedin: "in",
  "file-text": "📄",
  "file-pdf": "📄"
};

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

function texto(valor) {
  return String(valor ?? "").trim();
}

function maiusculo(valor) {
  return texto(valor).toLocaleUpperCase("pt-BR");
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dadosDoItem(item) {
  if (!item) return {};

  if (item.dados && typeof item.dados === "object") {
    return item.dados;
  }

  if (typeof item.dados === "string") {
    try {
      return JSON.parse(item.dados);
    } catch {
      return {};
    }
  }

  return {};
}

function icone(valor) {
  const original = texto(valor);
  if (!original) return "🧩";

  return ICONES[original.toLocaleLowerCase("pt-BR")] || original;
}

function elemento(id) {
  return document.getElementById(id);
}

function definirTexto(id, valor) {
  const el = elemento(id);
  if (!el || valor == null || texto(valor) === "") return;
  el.textContent = String(valor);
}

function definirHtml(id, valor) {
  const el = elemento(id);
  if (!el || valor == null) return;
  el.innerHTML = valor;
}

function definirVisibilidadeBloco(bloco, visivel) {
  document
    .querySelectorAll(`[data-cms-bloco="${bloco}"]`)
    .forEach(el => {
      el.hidden = !visivel;
    });
}

function configurarLink(el, rotulo, href, alvo = "_self", ativo = true) {
  if (!el) return;

  const link = texto(href);
  const titulo = texto(rotulo);

  el.hidden = ativo === false || !link;

  if (el.hidden) return;

  if (titulo) el.textContent = titulo;
  el.href = link;
  el.target = alvo === "_blank" ? "_blank" : "_self";

  if (el.target === "_blank") {
    el.rel = "noopener noreferrer";
  } else {
    el.removeAttribute("rel");
  }
}

function ordenar(itens) {
  return [...(itens || [])].sort((a, b) => {
    const ordemA = Number(a.ordem ?? 0);
    const ordemB = Number(b.ordem ?? 0);
    return ordemA - ordemB;
  });
}

function estaAtivo(item) {
  return item?.ativo !== false;
}

function identificarBloco(item) {
  return maiusculo(item?.bloco || item?.chave);
}

function agruparConteudos(conteudos) {
  const mapa = new Map();

  for (const item of ordenar(conteudos).filter(estaAtivo)) {
    const bloco = identificarBloco(item);
    if (!bloco) continue;

    if (!mapa.has(bloco)) mapa.set(bloco, []);
    mapa.get(bloco).push(item);
  }

  return mapa;
}

function primeiroItem(itens, codigoPreferido = "CABECALHO") {
  if (!Array.isArray(itens) || !itens.length) return null;

  return (
    itens.find(item => maiusculo(item.item_codigo) === codigoPreferido) ||
    itens[0]
  );
}

function gerarId(chave, armazenamento) {
  let valor = armazenamento.getItem(chave);

  if (!valor) {
    valor = crypto.randomUUID();
    armazenamento.setItem(chave, valor);
  }

  return valor;
}

/* ============================================================
   PÁGINA E CONTEÚDO
   ============================================================ */

async function carregarPagina(slug) {
  const { data, error } = await supabase
    .from("sar_site_paginas")
    .select("*")
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("SAR CMS V2 — erro ao carregar página:", error);
    return null;
  }

  return data;
}

async function carregarConteudos(paginaId) {
  if (!paginaId) return [];

  const { data, error } = await supabase
    .from("sar_site_conteudo")
    .select("*")
    .eq("pagina_id", paginaId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("SAR CMS V2 — erro ao carregar conteúdo:", error);
    return [];
  }

  return data || [];
}

function aplicarSeo(pagina) {
  if (!pagina) return;

  if (texto(pagina.titulo_seo)) {
    document.title = pagina.titulo_seo;
  }

  const meta = document.querySelector('meta[name="description"]');

  if (meta && texto(pagina.descricao_seo)) {
    meta.setAttribute("content", pagina.descricao_seo);
  }
}

/* ============================================================
   MENU
   ============================================================ */

async function carregarMenu() {
  const menu = elemento("menuPublico");
  if (!menu) return;

  const { data, error } = await supabase.rpc("sar_site_publico_menu", {
    p_local_menu: "cabecalho"
  });

  if (error) {
    console.error("SAR CMS V2 — erro ao carregar menu:", error);
    return;
  }

  const itens = ordenar(data || []).filter(estaAtivo);

  if (!itens.length) return;

  menu.innerHTML = itens
    .map((item, indice) => {
      const alvo = item.alvo === "_blank" ? "_blank" : "_self";
      const rel = alvo === "_blank" ? ' rel="noopener noreferrer"' : "";
      const classe = [
        indice === 0 ? "active" : "",
        item.destaque ? "destaque" : ""
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <a
          class="${classe}"
          href="${escaparHtml(item.link || "#")}"
          target="${alvo}"${rel}
        >
          ${
            item.icone
              ? `<span aria-hidden="true">${escaparHtml(
                  icone(item.icone)
                )}</span>`
              : ""
          }
          ${escaparHtml(item.rotulo || "Link")}
        </a>
      `;
    })
    .join("");
}

/* ============================================================
   HERO
   ============================================================ */

function renderizarHero(itens) {
  const item = primeiroItem(itens);
  if (!item) return;

  const dados = dadosDoItem(item);

  const titulo = texto(item.titulo || dados.titulo || "SAR:");
  const destaque = texto(
    dados.destaque ||
      item.subtitulo ||
      "onde a norma encontra a resposta."
  );

  definirTexto("heroBadge", dados.badge || dados.selo);
  definirTexto("heroDescricao", item.texto || dados.texto);

  const h1 = elemento("heroTitulo");

  if (h1) {
    h1.innerHTML = `
      ${escaparHtml(titulo)}
      <span id="heroDestaque">${escaparHtml(destaque)}</span>
    `;
  }

  configurarLink(
    elemento("btnConhecerSar"),
    dados.botao_secundario_rotulo ||
      dados.botao_conhecer_texto ||
      "Conhecer o SAR →",
    dados.botao_secundario_link ||
      dados.botao_conhecer_link ||
      "#plataforma",
    dados.botao_secundario_alvo || "_self",
    dados.botao_secundario_ativo !== false
  );

  configurarLink(
    elemento("btnAcessarHero"),
    dados.botao_principal_rotulo ||
      item.botao_texto ||
      "Acessar Plataforma",
    dados.botao_principal_link ||
      item.botao_link ||
      "/acesso.html",
    dados.botao_principal_alvo ||
      item.botao_alvo ||
      "_self",
    dados.botao_principal_ativo !== false
  );

  configurarLink(
    elemento("btnAcessarPlataforma"),
    dados.botao_cabecalho_rotulo || "Acessar Plataforma →",
    dados.botao_cabecalho_link || "/acesso.html",
    dados.botao_cabecalho_alvo || "_self",
    dados.botao_cabecalho_ativo !== false
  );
}

/* ============================================================
   PILARES
   ============================================================ */

function extrairItensInternos(itens) {
  if (!Array.isArray(itens) || !itens.length) return [];

  if (itens.length > 1) {
    return ordenar(itens).filter(estaAtivo);
  }

  const dados = dadosDoItem(itens[0]);

  if (Array.isArray(dados.itens)) {
    return ordenar(dados.itens).filter(estaAtivo);
  }

  return ordenar(itens).filter(estaAtivo);
}

function renderizarPilares(itens) {
  const lista = extrairItensInternos(itens).slice(0, 3);

  document.querySelectorAll("[data-pilar-indice]").forEach((card, indice) => {
    const item = lista[indice];

    card.hidden = !item;

    if (!item) return;

    const dados = dadosDoItem(item);

    definirTexto(
      `pilarTitulo${indice + 1}`,
      item.titulo || item.texto || dados.titulo
    );
  });
}

/* ============================================================
   ECOSSISTEMA E MÓDULOS
   ============================================================ */

function renderizarEcossistema(itens) {
  const item = primeiroItem(itens);
  if (!item) {
    definirVisibilidadeBloco("ECOSSISTEMA_SAR", false);
    return {};
  }

  const dados = dadosDoItem(item);

  definirTexto("plataformaTitulo", item.titulo || dados.titulo);
  definirTexto(
    "plataformaSubtitulo",
    item.subtitulo || dados.subtitulo
  );
  definirTexto("plataformaNota", item.texto || dados.texto);

  const rodape = elemento("plataformaRodape");

  if (rodape) {
    rodape.innerHTML = `
      <span>
        <strong>${escaparHtml(
          dados.rodape_esquerdo_titulo || "Plataforma modular:"
        )}</strong>
        ${escaparHtml(
          dados.rodape_esquerdo_texto ||
            "cada usuário acessará apenas os recursos liberados."
        )}
      </span>
      <span>${escaparHtml(
        dados.rodape_direito || "+ novos módulos em desenvolvimento"
      )}</span>
    `;
  }

  definirVisibilidadeBloco("ECOSSISTEMA_SAR", true);
  return dados;
}

async function carregarModulosPublicos(config = {}) {
  const grid = elemento("modulos");
  if (!grid) return;

  let consulta = supabase
    .from("sar_modulos")
    .select(
      "id,codigo,modulo,descricao,icone,rota,em_breve,status_desenvolvimento,ordem_menu,destaque_site"
    )
    .eq("ativo", true)
    .eq("exibir_site_publico", true)
    .is("modulo_pai", null);

  if (config.somente_destaques === true) {
    consulta = consulta.eq("destaque_site", true);
  }

  if (config.mostrar_em_breve === false) {
    consulta = consulta.eq("em_breve", false);
  }

  if (config.ordenar_destaques_primeiro !== false) {
    consulta = consulta.order("destaque_site", {
      ascending: false
    });
  }

  consulta = consulta.order("ordem_menu", {
    ascending: true
  });

  const { data, error } = await consulta;

  if (error) {
    console.error("SAR CMS V2 — erro ao carregar módulos:", error);

    grid.innerHTML = `
      <article class="module-card">
        <h3>Módulos indisponíveis</h3>
        <p>Não foi possível carregar os módulos neste momento.</p>
      </article>
    `;
    return;
  }

  const limite = Math.max(
    1,
    Number(config.quantidade_maxima || 12)
  );

  const modulos = (data || []).slice(0, limite);

  if (!modulos.length) {
    grid.innerHTML = `
      <article class="module-card">
        <h3>Novos módulos em preparação</h3>
        <p>Em breve novos recursos serão publicados.</p>
      </article>
    `;
    return;
  }

  grid.innerHTML = modulos
    .map(item => {
      const emDesenvolvimento =
        item.em_breve === true ||
        maiusculo(item.status_desenvolvimento) ===
          "EM_DESENVOLVIMENTO";

      const status = item.em_breve
        ? "Em breve"
        : texto(item.status_desenvolvimento || "Disponível")
            .replaceAll("_", " ");

      return `
        <article class="module-card ${
          emDesenvolvimento ? "future" : ""
        }">
          <div
            class="module-icon"
            aria-hidden="true"
            style="font-size:25px"
          >
            ${escaparHtml(icone(item.icone))}
          </div>

          <h3>${escaparHtml(item.modulo || item.codigo)}</h3>

          <p>
            ${escaparHtml(
              item.descricao ||
                "Módulo técnico da plataforma SAR."
            )}
          </p>

          <span class="status-tag">
            ${escaparHtml(status)}
          </span>
        </article>
      `;
    })
    .join("");
}

/* ============================================================
   BENEFÍCIOS
   ============================================================ */

function renderizarBeneficios(itens) {
  const lista = extrairItensInternos(itens).slice(0, 6);

  if (!lista.length) {
    definirVisibilidadeBloco("BENEFICIOS", false);
    return;
  }

  document
    .querySelectorAll("[data-beneficio-indice]")
    .forEach((card, indice) => {
      const item = lista[indice];

      card.hidden = !item;

      if (!item) return;

      const dados = dadosDoItem(item);

      definirTexto(
        `beneficioTitulo${indice + 1}`,
        item.titulo || dados.titulo
      );

      definirTexto(
        `beneficioTexto${indice + 1}`,
        item.texto || item.subtitulo || dados.texto
      );
    });

  definirVisibilidadeBloco("BENEFICIOS", true);
}

/* ============================================================
   CTA
   ============================================================ */

function renderizarCta(itens) {
  const item = primeiroItem(itens);

  if (!item) {
    definirVisibilidadeBloco("CTA", false);
    return;
  }

  const dados = dadosDoItem(item);

  definirTexto("ctaTitulo", item.titulo || dados.titulo);
  definirTexto("ctaTexto", item.texto || dados.texto);

  configurarLink(
    elemento("ctaBotao"),
    item.botao_texto ||
      dados.botao_rotulo ||
      "Acessar Plataforma",
    item.botao_link ||
      dados.botao_link ||
      "/acesso.html",
    item.botao_alvo ||
      dados.botao_alvo ||
      "_self",
    item.ativo !== false &&
      dados.botao_ativo !== false
  );

  definirVisibilidadeBloco("CTA", true);
}

/* ============================================================
   CONTATO
   ============================================================ */

function linkContatoValido(item) {
  const link = texto(item?.botao_link);
  if (!link || link === "#") return false;

  if (/wa\.me\/55?0{8,}$/i.test(link)) return false;

  return true;
}

function renderizarContato(itens) {
  if (!Array.isArray(itens) || !itens.length) {
    definirVisibilidadeBloco("CONTATO", false);
    return;
  }

  const cabecalho = primeiroItem(itens);
  const dadosCabecalho = dadosDoItem(cabecalho);

  definirTexto(
    "contatoTitulo",
    cabecalho?.titulo || dadosCabecalho.titulo || "Contato"
  );

  definirTexto(
    "contatoSubtitulo",
    cabecalho?.subtitulo ||
      dadosCabecalho.subtitulo ||
      "Fale com a SAR Engenharia"
  );

  definirTexto(
    "contatoTexto",
    cabecalho?.texto || dadosCabecalho.texto
  );

  const cards = elemento("contatoCards");
  if (!cards) return;

  const canais = ordenar(itens).filter(item => {
    const codigo = maiusculo(item.item_codigo);

    return (
      codigo !== "CABECALHO" &&
      estaAtivo(item) &&
      linkContatoValido(item)
    );
  });

  cards.innerHTML = canais
    .map(item => {
      const alvo =
        item.botao_alvo === "_blank" ? "_blank" : "_self";

      const rel =
        alvo === "_blank"
          ? ' rel="noopener noreferrer"'
          : "";

      return `
        <article class="cms-contato-card">
          <div class="cms-contato-icone" aria-hidden="true">
            ${escaparHtml(icone(item.icone || item.item_codigo))}
          </div>

          <div class="cms-contato-card-conteudo">
            <h3>${escaparHtml(item.titulo || "Contato")}</h3>

            <p>${escaparHtml(
              item.texto || item.subtitulo || ""
            )}</p>

            <a
              class="cms-contato-acao"
              href="${escaparHtml(item.botao_link)}"
              target="${alvo}"${rel}
            >
              ${escaparHtml(
                item.botao_texto || "Entrar em contato"
              )}
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
      `;
    })
    .join("");

  const aviso = elemento("contatoSemCanais");

  if (aviso) {
    aviso.hidden = canais.length > 0;
  }

  definirVisibilidadeBloco("CONTATO", true);
}

/* ============================================================
   REGISTRO DE ACESSO
   ============================================================ */

async function registrarAcesso() {
  try {
    await supabase.rpc("sar_registrar_acesso_site", {
      p_visitante_id: gerarId(
        "sar_visitante_id",
        localStorage
      ),
      p_sessao_id: gerarId(
        "sar_sessao_id",
        sessionStorage
      ),
      p_pagina: window.location.pathname || "/",
      p_origem: document.referrer || null,
      p_user_agent: navigator.userAgent || null
    });
  } catch (error) {
    console.warn(
      "SAR CMS V2 — acesso não registrado:",
      error
    );
  }
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

async function inicializarCms() {
  try {
    const pagina = await carregarPagina(SLUG_PAGINA);

    if (!pagina) {
      console.warn(
        `SAR CMS V2 — página "${SLUG_PAGINA}" não encontrada.`
      );

      await carregarModulosPublicos();
      return;
    }

    aplicarSeo(pagina);

    const conteudos = await carregarConteudos(pagina.id);
    const blocos = agruparConteudos(conteudos);

    renderizarHero(blocos.get("HERO"));
    renderizarPilares(blocos.get("PILARES"));

    const configModulos = renderizarEcossistema(
      blocos.get("ECOSSISTEMA_SAR")
    );

    renderizarBeneficios(blocos.get("BENEFICIOS"));
    renderizarCta(blocos.get("CTA"));
    renderizarContato(blocos.get("CONTATO"));

    await carregarModulosPublicos(configModulos);
  } catch (error) {
    console.error(
      "SAR CMS V2 — falha geral na inicialização:",
      error
    );
  }
}

Promise.allSettled([
  carregarMenu(),
  inicializarCms(),
  registrarAcesso()
]);
