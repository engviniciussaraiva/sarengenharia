import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const db=createClient('https://bjtxbpmrmhfvpmdsthxr.supabase.co','sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM');
const el=document.getElementById('moduloConteudo');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const urlValida=(v,video=false)=>{try{const u=new URL(v);return u.protocol==='https:'&&(!video||['youtube.com','www.youtube.com','youtu.be','www.youtu.be'].includes(u.hostname.toLowerCase()))?u.href:null}catch{return null}};
const lista=(titulo,itens)=>Array.isArray(itens)&&itens.length?`<section class="modulo-secao"><h2>${esc(titulo)}</h2><ul>${itens.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></section>`:'';
async function iniciar(){
 const id=new URLSearchParams(location.search).get('id');
 if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){el.textContent='Módulo não encontrado.';return;}
 const {data,error}=await db.from('sar_site_modulos_apresentacao').select('modulo_id,titulo,subtitulo,descricao,funcionalidades,normas,beneficios,imagem_url,video_url').eq('modulo_id',id).eq('publicado',true).maybeSingle();
 if(error||!data){el.textContent='Esta apresentação não está disponível.';return;}
 const m=data;document.title=`${m.titulo} | SAR Engenharia`;
 const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=(m.subtitulo||m.descricao||'Conheça o módulo do SAR Engenharia').slice(0,160);
 const imagem=urlValida(m.imagem_url),video=urlValida(m.video_url,true);
 el.innerHTML=`<p class="modulo-kicker">Ecossistema SAR</p><h1>${esc(m.titulo)}</h1>${m.subtitulo?`<p class="modulo-subtitulo">${esc(m.subtitulo)}</p>`:''}${m.descricao?`<p class="modulo-descricao">${esc(m.descricao)}</p>`:''}${imagem?`<img class="modulo-midia" src="${esc(imagem)}" alt="Apresentação visual do módulo ${esc(m.titulo)}" loading="lazy">`:''}<div class="modulo-secoes">${lista('Funcionalidades',m.funcionalidades)}${lista('Normas e referências',m.normas)}${lista('Benefícios',m.beneficios)}</div>${video?`<div class="modulo-video"><a href="${esc(video)}" target="_blank" rel="noopener noreferrer">▶ Assistir demonstração no YouTube</a></div>`:''}<a class="modulo-acao" href="/acesso.html">Acessar o SAR</a>`;
}
iniciar().catch(()=>{el.textContent='Não foi possível carregar esta apresentação.'});