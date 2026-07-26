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
async function menu(){const {data,error}=await supabase.from("sar_site_menu").select("*").eq("local_menu","cabecalho").eq("ativo",true).order("ordem");if(error)return[];return data||[];}
async function modulos(){const {data,error}=await supabase.from("sar_modulos").select("*").eq("ativo",true).eq("exibir_site_publico",true).order("ordem_menu");if(error)return[];return data||[];}
function grupos(rows){const g={};sort(rows).forEach(r=>{const b=code(r.bloco||r.chave);(g[b]??=[]).push(r)});return g;}
function renderHeader(g,menus){const marca=item(g,"MARCA"),sub=item(g,"SUBTITULO"),bot=item(g,"BOTAO_ACESSAR");document.getElementById("cabecalhoSite").innerHTML=`<div class="logo"><div class="logo-mark"></div><div>${esc(marca?.titulo||"")}<small>${esc(sub?.titulo||sub?.subtitulo||"")}</small></div></div><nav aria-label="Navegação principal" id="menuPublico">${menus.map((m,i)=>`<a class="${i===0?'active':''}" href="${esc(m.link||'#')}" target="${m.alvo==='_blank'?'_blank':'_self'}">${esc(m.rotulo||'')}</a>`).join('')}</nav>${linkHtml(bot,"btn primary")}`;}
function renderHero(g){const badge=item(g,"BADGE"),titulo=item(g,"TITULO"),desc=item(g,"DESCRICAO"),pilares=sort(g.filter(x=>code(x.item_codigo).startsWith("PILAR_"))),b1=item(g,"BOTAO_CONHECER"),b2=item(g,"BOTAO_ACESSAR");const t=txt(titulo?.titulo);const p=t.includes(":")?t.split(/:(.*)/s):[t,""];document.getElementById("heroConteudo").innerHTML=`${badge?`<div class="badge">${esc(badge.titulo)}</div>`:""}<h1>${esc(p[0]+(p[1]?":":""))}${p[1]?`<span>${esc(p[1].trim())}</span>`:""}</h1>${desc?`<p class="lead">${esc(desc.titulo||desc.texto)}</p>`:""}<div class="pilares">${pilares.map(x=>`<div class="pilar"><div class="status-ico">${esc(icon(x.icone))}</div><div>${esc(x.titulo)}</div></div>`).join('')}</div><div class="cta">${linkHtml(b1,"btn primary")}${linkHtml(b2,"btn")}</div>`;}
function renderEcossistema(g,mods){const h=item(g,"CABECALHO"),nota=item(g,"NOTA"),rod=item(g,"RODAPE");document.getElementById("ecossistemaCabecalho").outerHTML=`<div class="showcase-head" id="ecossistemaCabecalho"><div class="showcase-brand"><div class="logo-mark"></div><div><strong>${esc(h?.titulo||"")}</strong><span>${esc(h?.subtitulo||"")}</span></div></div><div class="showcase-note">${esc(nota?.texto||nota?.titulo||"")}</div></div>`;document.getElementById("modulos").innerHTML=mods.map(m=>`<article class="module-card ${m.destaque_site?'featured':''}"><div class="module-icon">${esc(icon(m.icone))}</div><h3>${esc(m.modulo||m.codigo)}</h3><p>${esc(m.descricao||"")}</p>${m.em_breve?'<span class="module-tag">Em breve</span>':''}</article>`).join('');document.getElementById("ecossistemaRodape").outerHTML=`<div class="showcase-footer" id="ecossistemaRodape"><span>${esc(rod?.texto||rod?.titulo||"")}</span><span>${esc(rod?.subtitulo||"")}</span></div>`;}
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
function renderRodape(g){const x=item(g,"RODAPE")||g[0];const el=document.getElementById("rodape");if(!x){el.hidden=true;return}el.innerHTML=`<div class="cms-rodape-principal"><div class="logo"><div>${esc(x.titulo||"")}<small>${esc(x.subtitulo||"")}</small></div></div><p>${esc(x.texto||"")}</p></div><div class="cms-rodape-inferior"><span>${esc(x.botao_texto||"")}</span><span>${esc(x.botao_link||"")}</span></div>`;}
async function iniciar(){try{const p=await pagina();if(!p)throw new Error("Página home não encontrada no CMS.");document.title=p.titulo_seo||document.title;const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=p.descricao_seo||"";const [rows,menus,mods]=await Promise.all([conteudos(p.id),menu(),modulos()]);const g=grupos(rows);renderHeader(g.CABECALHO||[],menus);renderHero(g.HERO||[]);renderEcossistema(g.ECOSSISTEMA||[],mods);renderBeneficios(g.BENEFICIOS||[]);renderCta(g.CTA||[]);renderContato(g.CONTATO||[]);renderRodape(g.RODAPE||[]);}catch(e){console.error("SAR CMS:",e);document.body.innerHTML='<main class="page"><div class="cms-erro">Não foi possível carregar o site. Verifique o CMS e o Supabase.</div></main>';}}
iniciar();
