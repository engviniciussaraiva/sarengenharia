import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* ============================================================
   SAR CMS V2.1
   Motor público da página inicial do SAR.

   Estrutura utilizada:
   - sar_site_paginas: identifica a página "home"
   - sar_site_conteudo:
       HERO     -> conteúdo principal e pilares
       CTA      -> chamada para acesso
       CONTATO  -> cabeçalho e canais de contato
   - sar_site_menu: carregado pela RPC sar_site_publico_menu
   - sar_modulos: monta automaticamente o Ecossistema SAR
   ============================================================ */

const SUPABASE_URL =
  "https://bjtxbpmrmhfvpmdsthxr.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

const PAGINA_SLUG =
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

function elemento(id) {
  return document.getElementById(id);
}

function definirTexto(id, valor) {
  const el = elemento(id);

  if (!el) return;
  if (valor == null) return;
  if (texto(valor) === "") return;

  el.textContent = String(valor);
}

function definirBlocoVisivel(
  nomeBloco,
  visivel
) {
  document
    .querySelectorAll(
      `[data-cms-bloco="${nomeBloco}"]`
    )
    .forEach(el => {
      el.hidden = !visivel;
    });
}

function dadosDoItem(item) {
  if (!item) return {};

  if (
    item.dados &&
    typeof item.dados === "object" &&
    !Array.isArray(item.dados)
  ) {
    return item.dados;
  }

  if (typeof item.dados === "string") {
    try {
      const dados = JSON.parse(item.dados);

      return dados &&
        typeof dados === "object"
        ? dados
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function obterIcone(valor) {
  const original = texto(valor);

  if (!original) return "🧩";

  const chave =
    original.toLocaleLowerCase("pt-BR");

  return ICONES[chave] || original;
}

function ordenar(itens) {
  return [...(itens || [])].sort(
    (a, b) => {
      const ordemA =
        Number(a?.ordem ?? 0);

      const ordemB =
        Number(b?.ordem ?? 0);

      if (ordemA !== ordemB) {
        return ordemA - ordemB;
      }

      return texto(a?.titulo).localeCompare(
        texto(b?.titulo),
        "pt-BR"
      );
    }
  );
}

function estaAtivo(item) {
  return item?.ativo !== false;
}

function identificarBloco(item) {
  return maiusculo(
    item?.bloco ||
    item?.chave
  );
}

function identificarItem(item) {
  return maiusculo(
    item?.item_codigo ||
    item?.chave ||
    item?.titulo
  );
}

function agruparPorBloco(conteudos) {
  const mapa = new Map();

  for (
    const item of ordenar(conteudos)
      .filter(estaAtivo)
  ) {
    const bloco =
      identificarBloco(item);

    if (!bloco) continue;

    if (!mapa.has(bloco)) {
      mapa.set(bloco, []);
    }

    mapa.get(bloco).push(item);
  }

  return mapa;
}

function localizarItem(
  itens,
  codigos = []
) {
  if (
    !Array.isArray(itens) ||
    !itens.length
  ) {
    return null;
  }

  const procurados =
    codigos.map(maiusculo);

  return (
    itens.find(item =>
      procurados.includes(
        identificarItem(item)
      )
    ) ||
    null
  );
}

function configurarLink(
  el,
  rotulo,
  href,
  alvo = "_self",
  ativo = true
) {
  if (!el) return;

  const link = texto(href);
  const titulo = texto(rotulo);

  el.hidden =
    ativo === false ||
    !link;

  if (el.hidden) return;

  if (titulo) {
    el.textContent = titulo;
  }

  el.href = link;

  el.target =
    alvo === "_blank"
      ? "_blank"
      : "_self";

  if (el.target === "_blank") {
    el.rel =
      "noopener noreferrer";
  } else {
    el.removeAttribute("rel");
  }
}

function obterOuCriarId(
  chave,
  armazenamento
) {
  let valor =
    armazenamento.getItem(chave);

  if (!valor) {
    valor = crypto.randomUUID();

    armazenamento.setItem(
      chave,
      valor
    );
  }

  return valor;
}

/* ============================================================
   PÁGINA E CONTEÚDO
   ============================================================ */

async function carregarPagina(slug) {
  const { data, error } =
    await supabase
      .from("sar_site_paginas")
      .select("*")
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();

  if (error) {
    console.error(
      "SAR CMS — erro ao carregar página:",
      error
    );

    return null;
  }

  return data;
}

async function carregarConteudos(
  paginaId
) {
  if (!paginaId) return [];

  const { data, error } =
    await supabase
      .from("sar_site_conteudo")
      .select("*")
      .eq("pagina_id", paginaId)
      .eq("ativo", true)
      .order("ordem", {
        ascending: true
      });

  if (error) {
    console.error(
      "SAR CMS — erro ao carregar conteúdos:",
      error
    );

    return [];
  }

  return data || [];
}

function aplicarSeo(pagina) {
  if (!pagina) return;

  if (texto(pagina.titulo_seo)) {
    document.title =
      pagina.titulo_seo;
  }

  const meta =
    document.querySelector(
      'meta[name="description"]'
    );

  if (
    meta &&
    texto(pagina.descricao_seo)
  ) {
    meta.setAttribute(
      "content",
      pagina.descricao_seo
    );
  }
}

/* ============================================================
   MENU PÚBLICO
   ============================================================ */

async function carregarMenu() {
  const menu =
    elemento("menuPublico");

  if (!menu) return;

  const { data, error } =
    await supabase.rpc(
      "sar_site_publico_menu",
      {
        p_local_menu:
          "cabecalho"
      }
    );

  if (error) {
    console.error(
      "SAR CMS — erro ao carregar menu:",
      error
    );

    return;
  }

  const itens =
    ordenar(data || [])
      .filter(estaAtivo);

  if (!itens.length) return;

  menu.innerHTML = itens
    .map((item, indice) => {
      const alvo =
        item.alvo === "_blank"
          ? "_blank"
          : "_self";

      const rel =
        alvo === "_blank"
          ? ' rel="noopener noreferrer"'
          : "";

      const classes = [
        indice === 0
          ? "active"
          : "",

        item.destaque
          ? "destaque"
          : ""
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <a
          class="${classes}"
          href="${escaparHtml(
            item.link || "#"
          )}"
          target="${alvo}"${rel}
        >
          ${
            item.icone
              ? `
                <span aria-hidden="true">
                  ${escaparHtml(
                    obterIcone(
                      item.icone
                    )
                  )}
                </span>
              `
              : ""
          }

          ${escaparHtml(
            item.rotulo ||
            "Link"
          )}
        </a>
      `;
    })
    .join("");
}

/* ============================================================
   HERO E PILARES
   ============================================================ */

function separarHeroEPilares(itens) {
  const lista =
    ordenar(itens || [])
      .filter(estaAtivo);

  if (!lista.length) {
    return {
      principal: null,
      pilares: []
    };
  }

  const principal =
    localizarItem(
      lista,
      [
        "CABECALHO",
        "PRINCIPAL",
        "HERO",
        "HERO_PRINCIPAL",
        "TITULO"
      ]
    ) ||
    lista[0];

  const pilares =
    lista
      .filter(
        item =>
          item !== principal
      )
      .filter(item => {
        const codigo =
          identificarItem(item);

        return ![
          "BOTAO",
          "BOTAO_PRINCIPAL",
          "BOTAO_SECUNDARIO",
          "CTA"
        ].includes(codigo);
      })
      .slice(0, 3);

  return {
    principal,
    pilares
  };
}

function renderizarHero(itens) {
  const {
    principal,
    pilares
  } =
    separarHeroEPilares(itens);

  if (!principal) {
    return;
  }

  const dados =
    dadosDoItem(principal);

  const titulo =
    principal.titulo ||
    dados.titulo ||
    "SAR:";

  const destaque =
    dados.destaque ||
    principal.subtitulo ||
    "onde a norma encontra a resposta.";

  definirTexto(
    "heroBadge",
    dados.badge ||
    dados.selo ||
    principal.item_codigo
  );

  definirTexto(
    "heroDescricao",
    principal.texto ||
    dados.texto ||
    dados.descricao
  );

  const h1 =
    elemento("heroTitulo");

  if (h1) {
    h1.innerHTML = `
      ${escaparHtml(titulo)}

      <span id="heroDestaque">
        ${escaparHtml(destaque)}
      </span>
    `;
  }

  configurarLink(
    elemento(
      "btnConhecerSar"
    ),

    dados.botao_secundario_rotulo ||
      dados.botao_conhecer_texto ||
      "Conhecer o SAR →",

    dados.botao_secundario_link ||
      dados.botao_conhecer_link ||
      "#plataforma",

    dados.botao_secundario_alvo ||
      "_self",

    dados.botao_secundario_ativo !==
      false
  );

  configurarLink(
    elemento(
      "btnAcessarHero"
    ),

    dados.botao_principal_rotulo ||
      principal.botao_texto ||
      "Acessar Plataforma",

    dados.botao_principal_link ||
      principal.botao_link ||
      "/acesso.html",

    dados.botao_principal_alvo ||
      principal.botao_alvo ||
      "_self",

    dados.botao_principal_ativo !==
      false
  );

  configurarLink(
    elemento(
      "btnAcessarPlataforma"
    ),

    dados.botao_cabecalho_rotulo ||
      "Acessar Plataforma →",

    dados.botao_cabecalho_link ||
      "/acesso.html",

    dados.botao_cabecalho_alvo ||
      "_self",

    dados.botao_cabecalho_ativo !==
      false
  );

  renderizarPilares(pilares);
}

function renderizarPilares(
  pilares
) {
  document
    .querySelectorAll(
      "[data-pilar-indice]"
    )
    .forEach(
      (card, indice) => {
        const item =
          pilares[indice];

        /*
         * Se não houver o pilar no banco,
         * mantém o texto fixo do index.html.
         */
        if (!item) {
          card.hidden = false;
          return;
        }

        const dados =
          dadosDoItem(item);

        card.hidden = false;

        definirTexto(
          `pilarTitulo${
            indice + 1
          }`,

          item.titulo ||
          item.texto ||
          dados.titulo
        );
      }
    );
}

/* ============================================================
   ECOSSISTEMA SAR
   Sempre aparece e consulta sar_modulos.
   ============================================================ */

function prepararEcossistema() {
  definirBlocoVisivel(
    "ECOSSISTEMA_SAR",
    true
  );

  return {
    somente_destaques: false,
    mostrar_em_breve: true,
    ordenar_destaques_primeiro:
      true,
    quantidade_maxima: 12
  };
}

async function carregarModulosPublicos(
  config = {}
) {
  const grid =
    elemento("modulos");

  if (!grid) return;

  let consulta =
    supabase
      .from("sar_modulos")
      .select(`
        id,
        codigo,
        modulo,
        descricao,
        icone,
        rota,
        em_breve,
        status_desenvolvimento,
        ordem_menu,
        destaque_site
      `)
      .eq("ativo", true)
      .eq(
        "exibir_site_publico",
        true
      )
      .is("modulo_pai", null);

  if (
    config.somente_destaques ===
    true
  ) {
    consulta =
      consulta.eq(
        "destaque_site",
        true
      );
  }

  if (
    config.mostrar_em_breve ===
    false
  ) {
    consulta =
      consulta.eq(
        "em_breve",
        false
      );
  }

  if (
    config
      .ordenar_destaques_primeiro !==
    false
  ) {
    consulta =
      consulta.order(
        "destaque_site",
        {
          ascending: false
        }
      );
  }

  consulta =
    consulta.order(
      "ordem_menu",
      {
        ascending: true
      }
    );

  const { data, error } =
    await consulta;

  if (error) {
    console.error(
      "SAR CMS — erro ao carregar módulos:",
      error
    );

    grid.innerHTML = `
      <article class="module-card">
        <h3>
          Módulos indisponíveis
        </h3>

        <p>
          Não foi possível carregar
          os módulos neste momento.
        </p>
      </article>
    `;

    return;
  }

  const limite =
    Math.max(
      1,
      Number(
        config.quantidade_maxima ||
        12
      )
    );

  const modulos =
    (data || []).slice(
      0,
      limite
    );

  if (!modulos.length) {
    grid.innerHTML = `
      <article class="module-card">
        <h3>
          Novos módulos em preparação
        </h3>

        <p>
          Em breve novos recursos
          serão publicados.
        </p>
      </article>
    `;

    return;
  }

  grid.innerHTML =
    modulos
      .map(item => {
        const statusOriginal =
          texto(
            item.status_desenvolvimento ||
            "disponivel"
          );

        const futuro =
          item.em_breve === true ||
          [
            "EM_DESENVOLVIMENTO",
            "EM DESENVOLVIMENTO",
            "EM_BREVE",
            "EM BREVE"
          ].includes(
            maiusculo(
              statusOriginal
            )
          );

        const status =
          item.em_breve === true
            ? "Em breve"
            : statusOriginal
                .replaceAll(
                  "_",
                  " "
                );

        return `
          <article
            class="module-card ${
              futuro
                ? "future"
                : ""
            }"
          >
            <div
              class="module-icon"
              aria-hidden="true"
              style="font-size:25px"
            >
              ${escaparHtml(
                obterIcone(
                  item.icone
                )
              )}
            </div>

            <h3>
              ${escaparHtml(
                item.modulo ||
                item.codigo ||
                "Módulo SAR"
              )}
            </h3>

            <p>
              ${escaparHtml(
                item.descricao ||
                "Módulo técnico da plataforma SAR."
              )}
            </p>

            <span
              class="status-tag"
            >
              ${escaparHtml(
                status
              )}
            </span>
          </article>
        `;
      })
      .join("");
}

/* ============================================================
   BENEFÍCIOS
   Mantém os itens existentes no index.html.
   ============================================================ */

function prepararBeneficios() {
  definirBlocoVisivel(
    "BENEFICIOS",
    true
  );

  document
    .querySelectorAll(
      "[data-beneficio-indice]"
    )
    .forEach(card => {
      card.hidden = false;
    });
}

/* ============================================================
   CTA
   ============================================================ */

function renderizarCta(itens) {
  const lista =
    ordenar(itens || [])
      .filter(estaAtivo);

  const item =
    lista[0];

  if (!item) {
    definirBlocoVisivel(
      "CTA",
      true
    );

    return;
  }

  const dados =
    dadosDoItem(item);

  definirTexto(
    "ctaTitulo",
    item.titulo ||
    dados.titulo
  );

  definirTexto(
    "ctaTexto",
    item.texto ||
    dados.texto
  );

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
      dados.botao_ativo !==
        false
  );

  definirBlocoVisivel(
    "CTA",
    true
  );
}

/* ============================================================
   CONTATO
   ============================================================ */

function linkContatoValido(
  item
) {
  const link =
    texto(item?.botao_link);

  if (
    !link ||
    link === "#"
  ) {
    return false;
  }

  /*
   * Impede publicação do número
   * fictício de WhatsApp.
   */
  if (
    /wa\.me\/55?0{8,}$/i.test(
      link
    )
  ) {
    return false;
  }

  return true;
}

function renderizarContato(
  itens
) {
  const lista =
    ordenar(itens || [])
      .filter(estaAtivo);

  if (!lista.length) {
    definirBlocoVisivel(
      "CONTATO",
      true
    );

    return;
  }

  const cabecalho =
    localizarItem(
      lista,
      [
        "CABECALHO",
        "PRINCIPAL",
        "CONTATO",
        "TITULO"
      ]
    ) ||
    lista[0];

  const dadosCabecalho =
    dadosDoItem(cabecalho);

  definirTexto(
    "contatoTitulo",

    cabecalho.titulo ||
    dadosCabecalho.titulo ||
    "Contato"
  );

  definirTexto(
    "contatoSubtitulo",

    cabecalho.subtitulo ||
    dadosCabecalho.subtitulo ||
    "Fale com a SAR Engenharia"
  );

  definirTexto(
    "contatoTexto",

    cabecalho.texto ||
    dadosCabecalho.texto
  );

  const cards =
    elemento("contatoCards");

  if (!cards) {
    definirBlocoVisivel(
      "CONTATO",
      true
    );

    return;
  }

  const canais =
    lista.filter(item => {
      return (
        item !== cabecalho &&
        linkContatoValido(item)
      );
    });

  cards.innerHTML =
    canais
      .map(item => {
        const alvo =
          item.botao_alvo ===
          "_blank"
            ? "_blank"
            : "_self";

        const rel =
          alvo === "_blank"
            ? ' rel="noopener noreferrer"'
            : "";

        return `
          <article
            class="cms-contato-card"
          >
            <div
              class="cms-contato-icone"
              aria-hidden="true"
            >
              ${escaparHtml(
                obterIcone(
                  item.icone ||
                  item.item_codigo
                )
              )}
            </div>

            <div
              class="cms-contato-card-conteudo"
            >
              <h3>
                ${escaparHtml(
                  item.titulo ||
                  "Contato"
                )}
              </h3>

              <p>
                ${escaparHtml(
                  item.texto ||
                  item.subtitulo ||
                  ""
                )}
              </p>

              <a
                class="cms-contato-acao"
                href="${escaparHtml(
                  item.botao_link
                )}"
                target="${alvo}"${rel}
              >
                ${escaparHtml(
                  item.botao_texto ||
                  "Entrar em contato"
                )}

                <span
                  aria-hidden="true"
                >
                  →
                </span>
              </a>
            </div>
          </article>
        `;
      })
      .join("");

  const aviso =
    elemento(
      "contatoSemCanais"
    );

  if (aviso) {
    aviso.hidden =
      canais.length > 0;
  }

  definirBlocoVisivel(
    "CONTATO",
    true
  );
}

/* ============================================================
   REGISTRO DE ACESSO
   ============================================================ */

async function registrarAcesso() {
  try {
    await supabase.rpc(
      "sar_registrar_acesso_site",
      {
        p_visitante_id:
          obterOuCriarId(
            "sar_visitante_id",
            localStorage
          ),

        p_sessao_id:
          obterOuCriarId(
            "sar_sessao_id",
            sessionStorage
          ),

        p_pagina:
          window.location.pathname ||
          "/",

        p_origem:
          document.referrer ||
          null,

        p_user_agent:
          navigator.userAgent ||
          null
      }
    );
  } catch (error) {
    console.warn(
      "SAR CMS — acesso não registrado:",
      error
    );
  }
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

async function inicializarCms() {
  try {
    const pagina =
      await carregarPagina(
        PAGINA_SLUG
      );

    if (!pagina) {
      console.warn(
        `SAR CMS — página "${PAGINA_SLUG}" não encontrada.`
      );

      prepararBeneficios();

      const configModulos =
        prepararEcossistema();

      await carregarModulosPublicos(
        configModulos
      );

      return;
    }

    aplicarSeo(pagina);

    const conteudos =
      await carregarConteudos(
        pagina.id
      );

    const blocos =
      agruparPorBloco(
        conteudos
      );

    renderizarHero(
      blocos.get("HERO")
    );

    prepararBeneficios();

    const configModulos =
      prepararEcossistema();

    renderizarCta(
      blocos.get("CTA")
    );

    renderizarContato(
      blocos.get("CONTATO")
    );

    await carregarModulosPublicos(
      configModulos
    );
  } catch (error) {
    console.error(
      "SAR CMS — falha geral na inicialização:",
      error
    );

    prepararBeneficios();
    prepararEcossistema();

    await carregarModulosPublicos();
  }
}

Promise.allSettled([
  carregarMenu(),
  inicializarCms(),
  registrarAcesso()
]);
