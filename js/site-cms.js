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
    brain:"🧠",
    clipboard:"📋",
    repeat:"🔁",
    droplet:"💧",
    water:"💧",
    calculator:"🧮",
    wrench:"🔧",
    settings:"⚙️",
    gear:"⚙️",
    printer:"🖨️",
    cube:"🧊",
    building:"🏢",
    stairs:"🪜",
    fire:"🔥",
    flame:"🔥",
    pump:"⚙️",
    book:"📚",
    database:"🗄️",
    shield:"🛡️",
    lock:"🔒",
    chart:"📊",
    home:"🏠",
    project:"📐",
    ruler:"📏",
    pipe:"🔩",
    conversion:"🔄"
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

  async function registrarAcesso(){
    try{
      const visitanteId = obterOuCriarId("sar_visitante_id", localStorage);
      const sessaoId = obterOuCriarId("sar_sessao_id", sessionStorage);

      await supabase.rpc("sar_registrar_acesso_site", {
        p_visitante_id: visitanteId,
        p_sessao_id: sessaoId,
        p_pagina: window.location.pathname || "/",
        p_origem: document.referrer || null,
        p_user_agent: navigator.userAgent || null
      });
    }catch(error){
      console.warn("SAR CMS: não foi possível registrar o acesso.", error);
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

  function mapearSecoes(secoes){
    return new Map((secoes || []).map(item => [String(item.chave || "").toUpperCase(), item]));
  }

  function aplicarTexto(id, valor){
    const el = document.getElementById(id);
    if(el && valor != null && String(valor).trim() !== ""){
      el.textContent = valor;
    }
  }

  function aplicarLink(id, titulo, link, ativo = true){
    const el = document.getElementById(id);
    if(!el) return;

    if(ativo === false){
      el.style.display = "none";
      return;
    }

    el.style.display = "";
    if(titulo) el.textContent = titulo;
    if(link) el.href = link;
  }

  async function carregarConteudo(){
    const [{ data: secoes, error: erroSecoes }, { data: paginas, error: erroPaginas }] =
      await Promise.all([
        supabase.rpc("sar_site_publico_secoes", { p_slug:"home" }),
        supabase.from("sar_site_paginas")
          .select("titulo_seo,descricao_seo")
          .eq("slug","home")
          .eq("ativo",true)
          .maybeSingle()
      ]);

    if(!erroPaginas && paginas){
      if(paginas.titulo_seo) document.title = paginas.titulo_seo;
      const meta = document.querySelector('meta[name="description"]');
      if(meta && paginas.descricao_seo) meta.setAttribute("content", paginas.descricao_seo);
    }

    if(erroSecoes){
      console.error("SAR CMS — seções:", erroSecoes);
      return;
    }

    const mapa = mapearSecoes(secoes);

    const hero = mapa.get("HERO");
    if(hero){
      aplicarTexto("heroBadge", hero.dados?.badge || hero.subtitulo);
      aplicarTexto("heroTitulo", hero.titulo);
      aplicarTexto("heroDestaque", hero.dados?.destaque);
      aplicarTexto("heroDescricao", hero.texto);

      aplicarLink(
        "btnConhecerSar",
        hero.dados?.botao_secundario_rotulo,
        hero.dados?.botao_secundario_link,
        hero.dados?.botao_secundario_ativo !== false
      );

      aplicarLink(
        "btnAcessarHero",
        hero.dados?.botao_principal_rotulo,
        hero.dados?.botao_principal_link || "/acesso.html",
        hero.dados?.botao_principal_ativo !== false
      );

      aplicarLink(
        "btnAcessarPlataforma",
        hero.dados?.botao_cabecalho_rotulo,
        hero.dados?.botao_cabecalho_link || "/acesso.html",
        hero.dados?.botao_cabecalho_ativo !== false
      );
    }

    const plataforma = mapa.get("PLATAFORMA");
    if(plataforma){
      aplicarTexto("plataformaTitulo", plataforma.titulo);
      aplicarTexto("plataformaSubtitulo", plataforma.subtitulo);
      aplicarTexto("plataformaNota", plataforma.texto);
      aplicarTexto("plataformaRodape", plataforma.dados?.rodape);
    }

    const beneficios = mapa.get("BENEFICIOS");
    if(beneficios && Array.isArray(beneficios.dados?.itens)){
      beneficios.dados.itens.slice(0,6).forEach((item, indice) => {
        aplicarTexto(`beneficioTitulo${indice + 1}`, item.titulo);
        aplicarTexto(`beneficioTexto${indice + 1}`, item.texto);
        const card = document.querySelector(`[data-beneficio-indice="${indice + 1}"]`);
        if(card){
          card.style.display = item.ativo === false ? "none" : "";
        }
      });
    }
  }

  async function carregarModulosPublicos(){
    const { data, error } = await supabase
      .from("sar_modulos")
      .select("id,codigo,modulo,descricao,icone,rota,em_breve,status_desenvolvimento,ordem_menu,destaque_site")
      .eq("ativo",true)
      .eq("exibir_site_publico",true)
      .is("modulo_pai",null)
      .order("destaque_site",{ascending:false})
      .order("ordem_menu",{ascending:true});

    const grid = document.getElementById("modulos");
    if(!grid) return;

    if(error){
      console.error("SAR CMS — módulos:", error);
      grid.innerHTML = '<article class="module-card"><h3>Módulos indisponíveis</h3><p>Não foi possível carregar os módulos neste momento.</p></article>';
      return;
    }

    if(!(data || []).length){
      grid.innerHTML = '<article class="module-card"><h3>Novos módulos em preparação</h3><p>Em breve novos recursos serão publicados.</p></article>';
      return;
    }

    grid.innerHTML = data.map(item => {
      const futuro = item.em_breve === true ||
        String(item.status_desenvolvimento || "") === "em_desenvolvimento";

      const status = item.em_breve === true
        ? "Em breve"
        : String(item.status_desenvolvimento || "disponivel")
            .replaceAll("_"," ");

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

  async function inicializarSite(){
    await Promise.allSettled([
      carregarMenu(),
      carregarConteudo(),
      carregarModulosPublicos(),
      registrarAcesso()
    ]);
  }

  inicializarSite();
