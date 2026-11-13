import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_URL="https://bjtxbpmrmhfvpmdsthxr.supabase.co";
const SUPABASE_KEY="sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM";
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const slug=document.documentElement.dataset.pagina||"home";
const ICONES={brain:"🧠",clipboard:"📋",repeat:"🔁",droplet:"💧",water:"💧",calculator:"🧮",wrench:"🔧",settings:"⚙️",gear:"⚙️",printer:"🖨️",cube:"🧊",building:"🏢",stairs:"🪜",fire:"🔥",flame:"🔥",pump:"⚙️",book:"📚",library:"📚",database:"🗄️",shield:"🛡️",lock:"🔒",chart:"📊",home:"🏠",project:"📐",ruler:"📏",pipe:"🔩",conversion:"🔄",globe:"🌐",support:"🎧",email:"✉️",mail:"✉️",whatsapp:"💬",phone:"☎️",telefone:"☎️",site:"🌐",linkedin:"in"};
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const txt=v=>String(v??"").trim();
const code=v=>txt(v).toUpperCase();
const icon=v=>ICONES[txt(v).toLowerCase()]||txt(v)||"🧩";
const sort=a=>[...(a||[])].sort((x,y)=>Number(x.ordem||0)-Number(y.ordem||0));
const item=(arr,c)=>arr.find(x=>code(x.item_codigo||x.chave)===c);
const ativo=x=>x?.ativo!==false;
function linkHtml(reg,classe="btn") {if(!reg||!txt(reg.botao_link))return "";return `<a class="${classe}" href="${esc(reg.botao_link)}" target="${reg.botao_alvo==="_blank"?"_blank":"_self"}" ${reg.botao_alvo==="_blank"?'rel="noopener noreferrer"':''}>${esc(reg.botao_texto||reg.titulo||"Acessar")}</a>`;}
async function pagina(){const {data,error}=await supabase.from("sar_site_paginas").select("*").eq("slug",slug).eq("ativo",true).maybeSingle();if(error)throw error;return data;}
async function conteudos(pid){const {data,error}=await supabase.from("sar_site_conteudo").select("*").eq("pagina_id",pid).eq("ativo",true).order("ordem");if(error)throw error;return data||[];}
async function menu(){const {data,error}=await supabase.from("sar_site_menu").select("*").eq("ativo",true).order("ordem");if(error)throw error;return data||[];}
async function modulos(){const {data,error}=await supabase.from("sar_modulos").select("*").eq("ativo",true).eq("exibir_site_publico",true).order("ordem_menu");if(error)return[];return data||[];}
function grupos(rows){const g={};const alias={ECOSSISTEM:"ECOSSISTEMA",ECOSSISTEMA_SAR:"ECOSSISTEMA"};sort(rows).forEach(r=>{const raw=code(r.bloco||r.chave);const b=alias[raw]||raw;(g[b]??=[]).push(r)});return g;}
function menuLink(m,i){const alvo=m.alvo==="_blank"?"_blank":"_self";const icone=txt(m.icone)?`<span class="cms-menu-icone" aria-hidden="true">${esc(icon(m.icone))}</span>`:"";return `<a class="${i===0?"active ":""}${m.destaque?"cms-menu-destaque":""}" href="${esc(m.link||"#")}" target="${alvo}" ${alvo==="_blank"?'rel="noopener noreferrer"':""}>${icone}${esc(m.rotulo||"")}</a>`;}
function renderHeader(g,menus){const marca=item(g,"MARCA"),sub=item(g,"SUBTITULO"),bot=item(g,"BOTAO_ACESSAR");document.getElementById("cabecalhoSite").innerHTML=`<div class="logo sar-logo-publica"><div class="sar-logo-texto"><div class="sar-logo-nome">${esc(marca?.titulo||"SAR Engenharia")}</div><small class="sar-logo-subtitulo"><span class="sar-logo-traco" aria-hidden="true"></span>${esc(sub?.titulo||sub?.subtitulo||"SISTEMA AVANÇADO DE RESPOSTA")}<span class="sar-logo-traco" aria-hidden="true"></span></small></div></div><nav aria-label="Navegação principal" id="menuPublico">${menus.map(menuLink).join('')}</nav>${linkHtml(bot,"btn primary")}`;}
function renderHero(g){const badge=item(g,"BADGE"),titulo=item(g,"TITULO"),desc=item(g,"DESCRICAO"),pilares=sort(g.filter(x=>code(x.item_codigo).startsWith("PILAR_"))),b1=item(g,"BOTAO_CONHECER"),b2=item(g,"BOTAO_ACESSAR");const t=txt(titulo?.titulo);const p=t.includes(":")?t.split(/:(.*)/s):[t,""];document.getElementById("heroConteudo").innerHTML=`${badge?`<div class="badge">${esc(badge.titulo)}</div>`:""}<h1>${esc(p[0]+(p[1]?":":""))}${p[1]?`<span>${esc(p[1].trim())}</span>`:""}</h1>${desc?`<p class="lead">${esc(desc.titulo||desc.texto)}</p>`:""}<div class="cta">${linkHtml(b1,"btn primary")}${linkHtml(b2,"btn")}</div>`;}
function renderEcossistema(g,mods){const h=item(g,"CABECALHO"),nota=item(g,"NOTA"),rod=item(g,"RODAPE");document.getElementById("ecossistemaCabecalho").outerHTML=`<div class="showcase-head" id="ecossistemaCabecalho"><div class="showcase-brand"><div><strong>${esc(h?.titulo||"")}</strong><span>${esc(h?.subtitulo||"")}</span></div></div><div class="showcase-note">${esc(nota?.texto||nota?.titulo||"")}</div></div>`;document.getElementById("modulos").innerHTML=mods.map(m=>`${(()=>{const tipo=txt(m.site_destino_tipo);const url=txt(m.site_destino_url);if(!['pagina','video','externo'].includes(tipo)||!url)return `<article class="module-card ${m.destaque_site?'featured':''}"><div class="module-icon">${esc(icon(m.icone))}</div><h3>${esc(m.modulo||m.codigo)}</h3><p>${esc(m.descricao||"")}</p>${m.em_breve?'<span class="module-tag">Em breve</span>':''}</article>`;let destino;try{destino=new URL(url,location.origin);if(!['http:','https:'].includes(destino.protocol))throw Error();if(tipo==='pagina'&&destino.origin!==location.origin)throw Error();if(tipo==='video'&&!['youtube.com','www.youtube.com','youtu.be','www.youtu.be'].includes(destino.hostname.toLowerCase()))throw Error();}catch(_){return `<article class="module-card ${m.destaque_site?'featured':''}"><div class="module-icon">${esc(icon(m.icone))}</div><h3>${esc(m.modulo||m.codigo)}</h3><p>${esc(m.descricao||"")}</p>${m.em_breve?'<span class="module-tag">Em breve</span>':''}</article>`;}const nova=m.site_abrir_nova_aba!==false;return `<a class="module-card cms-module-link ${m.destaque_site?'featured':''}" href="${esc(destino.href)}" target="${nova?'_blank':'_self'}" ${nova?'rel="noopener noreferrer"':''} aria-label="Conhecer ${esc(m.modulo||m.codigo)}"><div class="module-icon">${esc(icon(m.icone))}</div><h3>${esc(m.modulo||m.codigo)}</h3><p>${esc(m.descricao||"")}</p>${m.em_breve?'<span class="module-tag">Em breve</span>':''}<span class="cms-module-action">Conhecer módulo ↗</span></a>`;})()}`).join('');document.getElementById("ecossistemaRodape").outerHTML=`<div class="showcase-footer" id="ecossistemaRodape"><span>${esc(rod?.texto||rod?.titulo||"")}</span><span>${esc(rod?.subtitulo||"")}</span></div>`;}

// Faixa institucional: o CMS continua sendo a fonte dos textos quando os cinco PILAR_ estiverem configurados.
const SAR_DIFERENCIAIS_PADRAO=[
  ['Conformidade Normativa','shield'],['Cálculos Automatizados','bolt'],
  ['Biblioteca Técnica Integrada','layers'],['Geração de Documentos','gear'],['100% Online','monitor']
];
const SAR_ICONES_LINHA={
 shield:'<path d="M12 2 3.5 5.4v6.2c0 5.3 3.6 8.8 8.5 10.4 4.9-1.6 8.5-5.1 8.5-10.4V5.4L12 2Z"/><path d="m8 12 3 3 5-6"/>',
 bolt:'<path d="m13 2-9 11h7l-1 9 10-12h-7l0-8Z"/>',
 layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
 gear:'<path d="M10 2h4l.6 2.2 2 1 2.1-.9 2.8 2.8-.9 2.1 1 2L24 12l-2.4.8-1 2 .9 2.1-2.8 2.8-2.1-.9-2 1L14 22h-4l-.6-2.2-2-1-2.1.9-2.8-2.8.9-2.1-1-2L0 12l2.4-.8 1-2-.9-2.1 2.8-2.8 2.1.9 2-1L10 2Z" transform="translate(1 0) scale(.92 1)"/><circle cx="12" cy="12" r="3.3"/>',
 monitor:'<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M8 21h8M12 17v4"/>'
};
function renderDiferenciais(g){
 const alvo=document.getElementById('diferenciaisSAR');if(!alvo)return;
 const cadastrados=sort(g.filter(x=>code(x.item_codigo).startsWith('PILAR_')));
 const completo=cadastrados.length>=5;
 alvo.innerHTML=SAR_DIFERENCIAIS_PADRAO.map(([padrao,icone],i)=>{
   const registro=completo?cadastrados[i]:null;
   const titulo=registro?txt(registro.titulo)||padrao:padrao;
   return `<div class="sar-diferencial"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SAR_ICONES_LINHA[icone]}</svg><strong>${esc(titulo)}</strong></div>`;
 }).join('');
}

function renderBeneficios(g){document.getElementById("seguranca").innerHTML=sort(g).map(x=>`<div class="status-item"><div class="status-ico">${esc(icon(x.icone))}</div><div><strong>${esc(x.titulo||"")}</strong><span>${esc(x.texto||x.subtitulo||"")}</span></div></div>`).join('');}
function renderCta(g){const x=item(g,"CTA_PRINCIPAL")||g[0];const el=document.getElementById("cta");if(!x){el.hidden=true;return}el.innerHTML=`<div class="cms-cta-conteudo"><h2>${esc(x.titulo||"")}</h2><p>${esc(x.texto||"")}</p></div>${linkHtml(x,"btn primary")}`;}
function renderContato(g){
  const cab=item(g,"CABECALHO");
  const canais=sort(g.filter(x=>code(x.item_codigo)!=="CABECALHO"));
  const el=document.getElementById("contato");

  const cards=canais.map(x=>{
    const href=txt(x.botao_link);
    const alvo=x.botao_alvo==="_blank"?"_blank":"_self";
    const conteudo=`<span class="cms-contato-icone">${esc(icon(x.icone))}</span><span class="cms-contato-info"><strong>${esc(x.titulo||x.botao_texto||"")}</strong>${txt(x.texto)?`<small>${esc(x.texto)}</small>`:""}</span>`;

    return href
      ? `<a class="cms-contato-canal" href="${esc(href)}" target="${alvo}" ${alvo==="_blank"?'rel="noopener noreferrer"':''}>${conteudo}</a>`
      : `<div class="cms-contato-canal sem-link">${conteudo}</div>`;
  }).join("");

  el.innerHTML=`
    <div class="cms-contato-cabecalho">
      <span class="cms-kicker">${esc(cab?.subtitulo||"")}</span>
      <h2>${esc(cab?.titulo||"")}</h2>
      <p>${esc(cab?.texto||"")}</p>
    </div>
    <div class="cms-contato-canais" data-quantidade="${canais.length}">
      ${cards}
    </div>`;
}
function renderRodape(g,menus=[]){const x=item(g,"RODAPE")||g[0];const el=document.getElementById("rodape");if(!x){el.hidden=true;return}el.innerHTML=`<div class="cms-rodape-principal"><div class="logo"><div>${esc(x.titulo||"")}<small>${esc(x.subtitulo||"")}</small></div></div><p>${esc(x.texto||"")}</p></div><div class="cms-rodape-inferior"><span>${esc(x.botao_texto||"")}</span><span>${esc(x.botao_link||"")}</span></div>${menus.length?`<nav class="cms-rodape-menu" aria-label="Links do rodapé">${menus.map(menuLink).join("")}</nav>`:""}`;}
async function iniciar(){try{const p=await pagina();if(!p)throw new Error("Página home não encontrada no CMS.");document.title=p.titulo_seo||document.title;const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=p.descricao_seo||"";const [rows,menus,mods]=await Promise.all([conteudos(p.id),menu(),modulos()]);const g=grupos(rows);renderHeader(g.CABECALHO||[],menus.filter(m=>code(m.local_menu)==="CABECALHO"));renderHero(g.HERO||[]);renderDiferenciais(g.HERO||[]);renderEcossistema(g.ECOSSISTEMA||[],mods);renderBeneficios(g.BENEFICIOS||[]);renderCta(g.CTA||[]);renderContato(g.CONTATO||[]);renderRodape(g.RODAPE||[],menus.filter(m=>code(m.local_menu)==="RODAPE"));}catch(e){console.error("SAR CMS:",e);document.body.innerHTML='<main class="page"><div class="cms-erro">Não foi possível carregar o site. Verifique o CMS e o Supabase.</div></main>';}}
iniciar();
