import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://bjtxbpmrmhfvpmdsthxr.supabase.co";
const SUPABASE_KEY = "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const fallbackIcones = {
  brain:"🧠", clipboard:"📋", repeat:"🔁", droplet:"💧", water:"💧",
  calculator:"🧮", wrench:"🔧", settings:"⚙️", gear:"⚙️",
  printer:"🖨️", cube:"🧊", building:"🏢", stairs:"🪜",
  fire:"🔥", flame:"🔥", pump:"⚙️", book:"📚", library:"📚",
  database:"🗄️", shield:"🛡️", lock:"🔒", chart:"📊",
  home:"🏠", project:"📐", ruler:"📏", pipe:"🔩", conversion:"🔄",
  globe:"🌐", support:"🎧", "file-text":"📄", "file-pdf":"📄"
};

function escaparHtml(valor){
  return String(valor ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function obterIcone(valor){
  const original = String(valor || "").trim();
  if(!original) return "🧩";
  const chave = original.toLocaleLowerCase("pt-BR");
  return fallbackIcones[chave] || original;
}

function obterOuCriarId(chave, armazenamento){
  let valor = armazenamento.getItem(chave);
  if(!valor){
    valor = crypto.randomUUID();
    armazenamento.setItem(chave, valor);
  }
  return valor;
}

function mapearSecoes(secoes){
  return new Map((secoes || []).map(item => [
    String(item.chave || "").toUpperCase(),
    item
  ]));
}

function aplicarTexto(id, valor){
  const elemento = document.getElementById(id);
  if(elemento && valor != null){
    elemento.textContent = String(valor);
  }
}

function aplicarLink(id, rotulo, link, ativo = true){
  const elemento = document.getElementById(id);
  if(!elemento) return;

  elemento.hidden = ativo === false;

  if(ativo !== false){
    if(rotulo) elemento.textContent = rotulo;
    if(link) elemento.href = link;
  }
}

function definirBlocoVisivel(chave, visivel){
  document.querySelectorAll(`[data-cms-bloco="${chave}"]`)
    .forEach(elemento => elemento.hidden = !visivel);
}

async function registrarAcesso(){
  try{
    await supabase.rpc("sar_registrar_acesso_site", {
      p_visitante_id: obterOuCriarId("sar_visitante_id", localStorage),
      p_sessao_id: obterOuCriarId("sar_sessao_id", sessionStorage),
      p_pagina: window.location.pathname || "/",
      p_origem: document.referrer || null,
      p_user_agent: navigator.userAgent || null
    });
  }catch(error){
    console.warn("SAR CMS — acesso não registrado:", error);
  }
}

async function carregarMenu(){
  const { data, error } = await supabase.rpc("sar_site_publico_menu", {
    p_local_menu:"cabecalho"
  });

  if(error){
    console.error("SAR CMS — menu:", error);
    return;
  }

  const menu = document.getElementById("menuPublico");
  if(!menu) return;

  menu.innerHTML = (data || []).map((item, indice) => `
    <a
      class="${indice === 0 ? "active" : ""}${item.destaque ? " destaque" : ""}"
      href="${escaparHtml(item.link || "#")}"
      target="${item.alvo === "_blank" ? "_blank" : "_self"}"
      ${item.alvo === "_blank" ? 'rel="noopener noreferrer"' : ""}
    >
      ${item.icone ? `<span aria-hidden="true">${escaparHtml(item.icone)}</span> ` : ""}
      ${escaparHtml(item.rotulo || "Link")}
    </a>
  `).join("");
}

function renderizarHero(secao){
  if(!secao) return;

  aplicarTexto("heroBadge", secao.dados?.badge || secao.subtitulo);
  aplicarTexto("heroTitulo", secao.titulo);
  aplicarTexto("heroDestaque", secao.dados?.destaque);
  aplicarTexto("heroDescricao", secao.texto);

  aplicarLink(
    "btnConhecerSar",
    secao.dados?.botao_secundario_rotulo,
    secao.dados?.botao_secundario_link,
    secao.dados?.botao_secundario_ativo !== false
  );

  aplicarLink(
    "btnAcessarHero",
    secao.dados?.botao_principal_rotulo,
    secao.dados?.botao_principal_link || "/acesso.html",
    secao.dados?.botao_principal_ativo !== false
  );

  aplicarLink(
    "btnAcessarPlataforma",
    secao.dados?.botao_cabecalho_rotulo,
    secao.dados?.botao_cabecalho_link || "/acesso.html",
    secao.dados?.botao_cabecalho_ativo !== false
  );
}

function renderizarPilares(secao){
  if(!secao || !Array.isArray(secao.dados?.itens)) return;

  const itens = [...secao.dados.itens]
    .filter(item => item.ativo !== false)
    .sort((a,b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .slice(0,3);

  document.querySelectorAll("[data-pilar-indice]").forEach((card, indice) => {
    const item = itens[indice];
    card.hidden = !item;
    if(item){
      aplicarTexto(`pilarTitulo${indice + 1}`, item.titulo);
    }
  });
}

function renderizarEcossistema(secao){
  if(!secao) return;

  aplicarTexto("plataformaTitulo", secao.titulo);
  aplicarTexto("plataformaSubtitulo", secao.subtitulo);
  aplicarTexto("plataformaNota", secao.texto);

  const rodape = document.getElementById("plataformaRodape");
  if(rodape){
    rodape.innerHTML = `
      <span>
        <strong>${escaparHtml(secao.dados?.rodape_esquerdo_titulo || "Plataforma modular:")}</strong>
        ${escaparHtml(secao.dados?.rodape_esquerdo_texto || "")}
      </span>
      <span>${escaparHtml(secao.dados?.rodape_direito || "")}</span>
    `;
  }
}

function renderizarBeneficios(secao){
  if(!secao || !Array.isArray(secao.dados?.itens)) return;

  const itens = [...secao.dados.itens]
    .sort((a,b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .slice(0,6);

  document.querySelectorAll("[data-beneficio-indice]").forEach((card, indice) => {
    const item = itens[indice];
    card.hidden = !item || item.ativo === false;

    if(item){
      aplicarTexto(`beneficioTitulo${indice + 1}`, item.titulo);
      aplicarTexto(`beneficioTexto${indice + 1}`, item.texto);
    }
  });
}

function renderizarCta(secao){
  if(!secao) return;
  aplicarTexto("ctaTitulo", secao.titulo);
  aplicarTexto("ctaTexto", secao.texto);
  aplicarLink(
    "ctaBotao",
    secao.dados?.botao_rotulo,
    secao.dados?.botao_link || "/acesso.html",
    secao.dados?.botao_ativo !== false
  );
}

function renderizarContato(secao){
  if(!secao) return;

  aplicarTexto("contatoTitulo", secao.titulo);
  aplicarTexto("contatoSubtitulo", secao.subtitulo);
  aplicarTexto("contatoTexto", secao.texto);

  const email = String(secao.dados?.email || "").trim();
  const telefone = String(secao.dados?.telefone || "").trim();
  const whatsapp = String(secao.dados?.whatsapp || "").replace(/\D/g,"");

  aplicarLink("contatoEmail", email ? `E-mail: ${email}` : "", email ? `mailto:${email}` : "", Boolean(email));
  aplicarLink("contatoTelefone", telefone ? `Telefone: ${telefone}` : "", telefone ? `tel:${telefone.replace(/\s/g,"")}` : "", Boolean(telefone));
  aplicarLink("contatoWhatsapp", whatsapp ? "Falar pelo WhatsApp" : "", whatsapp ? `https://wa.me/${whatsapp}` : "", Boolean(whatsapp));
}

function renderizarRodape(secao){
  if(!secao) return;

  aplicarTexto("rodapeTitulo", secao.titulo);
  aplicarTexto("rodapeSubtitulo", secao.subtitulo);
  aplicarTexto("rodapeTexto", secao.texto);

  const ano = secao.dados?.mostrar_ano_atual !== false
    ? ` © ${new Date().getFullYear()}`
    : "";

  aplicarTexto(
    "rodapeDireitos",
    `${secao.dados?.direitos || "Todos os direitos reservados."}${ano}`
  );

  aplicarLink("rodapeInstagram", "Instagram", secao.dados?.instagram, Boolean(secao.dados?.instagram));
  aplicarLink("rodapeLinkedin", "LinkedIn", secao.dados?.linkedin, Boolean(secao.dados?.linkedin));
  aplicarLink("rodapeYoutube", "YouTube", secao.dados?.youtube, Boolean(secao.dados?.youtube));
}

async function carregarModulosPublicos(config = {}){
  let consulta = supabase
    .from("sar_modulos")
    .select("id,codigo,modulo,descricao,icone,rota,em_breve,status_desenvolvimento,ordem_menu,destaque_site")
    .eq("ativo",true)
    .eq("exibir_site_publico",true)
    .is("modulo_pai",null);

  if(config.somente_destaques === true){
    consulta = consulta.eq("destaque_site",true);
  }

  if(config.mostrar_em_breve === false){
    consulta = consulta.eq("em_breve",false);
  }

  if(config.ordenar_destaques_primeiro !== false){
    consulta = consulta.order("destaque_site",{ascending:false});
  }

  consulta = consulta.order("ordem_menu",{ascending:true});

  const { data, error } = await consulta;
  const grid = document.getElementById("modulos");
  if(!grid) return;

  if(error){
    console.error("SAR CMS — módulos:", error);
    grid.innerHTML = '<article class="module-card"><h3>Módulos indisponíveis</h3><p>Não foi possível carregar os módulos neste momento.</p></article>';
    return;
  }

  const limite = Math.max(1, Number(config.quantidade_maxima || 12));
  const modulos = (data || []).slice(0, limite);

  if(!modulos.length){
    grid.innerHTML = '<article class="module-card"><h3>Novos módulos em preparação</h3><p>Em breve novos recursos serão publicados.</p></article>';
    return;
  }

  grid.innerHTML = modulos.map(item => {
    const futuro = item.em_breve === true ||
      String(item.status_desenvolvimento || "") === "em_desenvolvimento";

    const status = item.em_breve === true
      ? "Em breve"
      : String(item.status_desenvolvimento || "disponivel").replaceAll("_"," ");

    return `
      <article class="module-card ${futuro ? "future" : ""}">
        <div class="module-icon" aria-hidden="true" style="font-size:25px">
          ${escaparHtml(obterIcone(item.icone))}
        </div>
        <h3>${escaparHtml(item.modulo || item.codigo)}</h3>
        <p>${escaparHtml(item.descricao || "Módulo técnico da plataforma SAR.")}</p>
        <span class="status-tag">${escaparHtml(status)}</span>
      </article>
    `;
  }).join("");
}

async function carregarConteudo(){
  const [
    { data: secoes, error: erroSecoes },
    { data: pagina, error: erroPagina }
  ] = await Promise.all([
    supabase.rpc("sar_site_publico_secoes", { p_slug:"home" }),
    supabase.from("sar_site_paginas")
      .select("titulo_seo,descricao_seo")
      .eq("slug","home")
      .eq("ativo",true)
      .maybeSingle()
  ]);

  if(!erroPagina && pagina){
    if(pagina.titulo_seo) document.title = pagina.titulo_seo;
    const meta = document.querySelector('meta[name="description"]');
    if(meta && pagina.descricao_seo){
      meta.setAttribute("content", pagina.descricao_seo);
    }
  }

  if(erroSecoes){
    console.error("SAR CMS — seções:", erroSecoes);
    await carregarModulosPublicos();
    return;
  }

  const mapa = mapearSecoes(secoes);

  renderizarHero(mapa.get("HERO"));
  renderizarPilares(mapa.get("PILARES"));
  renderizarEcossistema(mapa.get("ECOSSISTEMA_SAR"));
  renderizarBeneficios(mapa.get("BENEFICIOS"));
  renderizarCta(mapa.get("CTA"));
  renderizarContato(mapa.get("CONTATO"));
  renderizarRodape(mapa.get("RODAPE"));

  definirBlocoVisivel("ECOSSISTEMA_SAR", mapa.has("ECOSSISTEMA_SAR"));
  definirBlocoVisivel("BENEFICIOS", mapa.has("BENEFICIOS"));
  definirBlocoVisivel("CTA", mapa.has("CTA"));
  definirBlocoVisivel("CONTATO", mapa.has("CONTATO"));
  definirBlocoVisivel("RODAPE", mapa.has("RODAPE"));

  await carregarModulosPublicos(
    mapa.get("ECOSSISTEMA_SAR")?.dados || {}
  );
}

async function inicializarSite(){
  await Promise.allSettled([
    carregarMenu(),
    carregarConteudo(),
    registrarAcesso()
  ]);
}

inicializarSite();
