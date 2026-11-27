/* SAR — Dimensionamento de Redes de Hidrantes, Aba 02.
 * Interface e persistência de entradas somente; classificação no backend oficial.
 * Fonte normativa exclusiva: API autorizada do SAR / Supabase privado.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const ENDPOINT='/api/incendio/hidrantes/edificacoes';
  const URL_BASE=window.SAR_API_CONFIG?.API_BASE_URL;
  const SUPABASE_URL='https://bjtxbpmrmhfvpmdsthxr.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM';
  const fmt=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const opt=(rotulo,valor)=>new Option(rotulo,String(valor));
  const numBR=s=>{const raw=String(s??'').trim().replace(/\s/g,'');if(!raw)return null;const n=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);return Number.isFinite(n)&&n>=0?n:null};
  const novo=(id,nome)=>({id,nome,area:'',grupo:'',divisao:'',atividade:'',produtos:[],ajuste:false,cargaManual:'',justificativa:''});
  let eds=[novo(1,'Galpão 01')], ativo=1, nextEd=2, nextProd=1;
  let catalogo=[],grupos=[],pronto=false,sequencia=0,temporizador=null;
  let promiseClient=null;
  const buscar=()=>eds.find(e=>e.id===ativo);
  const dadosGrupo=()=>catalogo.filter(r=>r.grupo===buscar().grupo);
  function mensagem(msg,erro=false){$('ed-status').textContent=msg;$('ed-status').style.color=erro?'#b71c1c':'#006400';}
  function estadoFonte(texto){$('ed-fonte').textContent=texto;}
  function atualizarResultado(res){
    const divisao=res?.divisao||'A determinar',risco=res?.risco||'A determinar',carga=res?.carga_adotada_mj_m2;
    $('ed-resultado-divisao').textContent=divisao;
    $('ed-resultado-risco').textContent=risco;
    $('ed-resultado-risco').className='ed-risk '+({'Baixo':'baixo','Médio':'medio','Alto':'alto'}[risco]||'');
    $('ed-resultado-carga').textContent=Number.isFinite(Number(carga))&&carga!==undefined&&carga!==null?fmt(carga):'—';
    $('ed-carga').value=carga===undefined||carga===null?'':fmt(carga);
    if(buscar().grupo==='J'){
      buscar().divisao=divisao==='A determinar'?'':divisao;
      const produtos=res?.produtos||[],governante=produtos.find(p=>p.atividade_id===res?.produto_governante_id);
      $('ed-governante').textContent=governante?
        `Carga governante: ${governante.produto} — ${governante.altura_m==null?'J-1 direto':fmt(governante.altura_m)+' m'} — ${fmt(governante.carga_mj_m2)} MJ/m².`:
        'Cadastre um ou mais produtos e suas alturas para determinar a carga governante.';
      atualizarCargasProduto(produtos);
    }
  }
  function atualizarCargasProduto(produtos=[]){
    $('ed-produtos').querySelectorAll('tr[data-prod-id]').forEach(tr=>{
      const p=buscar().produtos.find(q=>String(q.id)===tr.dataset.prodId);
      const info=produtos.find(q=>String(q.atividade_id)===String(p?.produto));
      tr.querySelector('.ed-result-value').textContent=info?fmt(info.carga_mj_m2):'—';
    });
  }
  function cards(){
    $('ed-list').replaceChildren(...eds.map((ed,i)=>{
      const b=document.createElement('button');b.type='button';b.className='ed-chip'+(ed.id===ativo?' selected':'');
      b.textContent=ed.nome.trim()||'Edificação '+(i+1);b.setAttribute('aria-pressed',String(ed.id===ativo));
      b.addEventListener('click',()=>{ativo=ed.id;render();});return b;
    }));
    $('ed-count').textContent=String(eds.length);
    $('ed-remove').disabled=eds.length===1;
  }
  function choices(sel,lista,valor,rotulo='Selecione'){
    sel.replaceChildren(opt(rotulo,''),...lista.map(([v,t])=>opt(t,v)));
    sel.value=String(valor||'');if(!sel.value)sel.value='';
  }
  function grupoOptions(){
    choices($('ed-grupo'),grupos.map(g=>[g.codigo,`${g.codigo} — ${g.nome||'Ocupação'}`]),buscar().grupo,pronto?'Selecione o grupo':'Carregando cadastros...');
    $('ed-grupo').disabled=!pronto;
  }
  // Ocupação — comportamento do Hidrante Beta (seleção nativa com filtro
  // progressivo, acentos ignorados e lista expandida no mesmo SELECT).
  // Mantém o ID técnico de cada registro do Cadastro Central do SAR.
  let ocupacaoLista=[],ocupacaoFiltro='',ocupacaoAberta=false;
  const normalizarOcupacao=texto=>String(texto||'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

  function rotuloOcupacao(registro){
    const divisao=registro.divisao_direta||registro.divisao_referencia||'';
    const carga=registro.carga_incendio_m2;
    const partes=[registro.descricao||'Atividade sem descrição'];
    if(divisao)partes.push(divisao);
    if(carga!==null&&carga!==undefined&&String(carga).trim()!==''){
      const valor=Number(carga);
      partes.push((Number.isFinite(valor)?valor.toLocaleString('pt-BR'):String(carga))+' MJ/m²');
    }
    return partes.join(' | ');
  }

  function fecharListaOcupacao(restaurar=true){
    const sel=$('ed-atividade');
    ocupacaoAberta=false;ocupacaoFiltro='';
    sel.removeAttribute('size');
    sel.removeAttribute('data-open');
    if(restaurar)filtrarListaOcupacao('',false);
  }

  function filtrarListaOcupacao(termo=ocupacaoFiltro,abrir=ocupacaoAberta){
    const sel=$('ed-atividade'), ed=buscar();
    const filtro=normalizarOcupacao(termo);
    const valores=ocupacaoLista.filter(item=>!filtro||normalizarOcupacao(item.rotulo).includes(filtro));
    const valorEscolhido=ed?.atividade||'';
    // Nenhuma escolha técnica é registrada até o usuário selecionar/confirmar.
    sel.replaceChildren(opt(filtro?'Resultados encontrados: '+valores.length:'Selecione a ocupação',''),
      ...valores.map(item=>opt(item.rotulo,item.valor)));
    sel.options[0].disabled=true;
    const selecionado=valores.some(item=>item.valor===String(valorEscolhido));
    if(selecionado)sel.value=String(valorEscolhido);
    else if(filtro&&valores.length)sel.selectedIndex=1; // destaque para Enter
    else sel.selectedIndex=0;
    if(abrir && sel.disabled!==true && buscar().grupo!=='J'){
      sel.size=Math.min(Math.max(valores.length+1,2),10);
      sel.dataset.open='1';ocupacaoAberta=true;
    }else{
      sel.removeAttribute('size');sel.removeAttribute('data-open');ocupacaoAberta=false;
    }
  }

  function ocupacaoOptions(){
    const ed=buscar(),sel=$('ed-atividade');
    ocupacaoAberta=false;ocupacaoFiltro='';
    if(ed.grupo==='J'){
      ocupacaoLista=[];
      sel.replaceChildren(opt('Depósito / Armazenamento — informe os produtos abaixo','grupo-j'));
      sel.value='grupo-j';sel.disabled=true;sel.removeAttribute('size');
      return;
    }
    ocupacaoLista=dadosGrupo().map(r=>({valor:String(r.id),rotulo:rotuloOcupacao(r)}))
       .sort((a,b)=>a.rotulo.localeCompare(b.rotulo,'pt-BR',{sensitivity:'base'}));
    sel.disabled=!pronto||!ed.grupo;
    filtrarListaOcupacao('',false);
    if(!pronto)sel.options[0].textContent='Carregando cadastros...';
    else if(!ed.grupo)sel.options[0].textContent='Selecione o uso primeiro';
    else if(!ocupacaoLista.length)sel.options[0].textContent='Nenhuma ocupação cadastrada para este uso';
  }

  function registrarOcupacaoSelecionada(){
    if(!pronto||buscar().grupo==='J')return;
    const sel=$('ed-atividade');
    const valor=String(sel.value||'');
    if(!valor||!ocupacaoLista.some(item=>item.valor===valor)){
      fecharListaOcupacao();return;
    }
    const ed=buscar();ed.atividade=valor;
    const registro=catalogo.find(r=>String(r.id)===valor);
    // Divisão permanece informação derivada, sem campo manual na interface.
    ed.divisao=registro?(registro.divisao_direta||registro.divisao_referencia||''):'';
    fecharListaOcupacao();
    agendarClassificacao();
  }

  $('ed-atividade').addEventListener('keydown',evento=>{
    if(!pronto||buscar().grupo==='J')return;
    const sel=$('ed-atividade');
    if(evento.key==='Escape'){
      evento.preventDefault();fecharListaOcupacao();return;
    }
    if(evento.key==='Enter'){
      if(ocupacaoAberta){evento.preventDefault();registrarOcupacaoSelecionada();}
      return;
    }
    if(evento.key==='Backspace'){
      evento.preventDefault();ocupacaoFiltro=ocupacaoFiltro.slice(0,-1);
      filtrarListaOcupacao(ocupacaoFiltro,true);return;
    }
    if(evento.key.length===1&&!evento.ctrlKey&&!evento.altKey&&!evento.metaKey){
      evento.preventDefault();ocupacaoFiltro+=evento.key;
      filtrarListaOcupacao(ocupacaoFiltro,true);return;
    }
    // Setas, PageUp/PageDown, Home e End mantêm a navegação nativa.
  });
  $('ed-atividade').addEventListener('mousedown',evento=>{
    const sel=$('ed-atividade');
    if(sel.disabled||ocupacaoAberta)return;
    evento.preventDefault();ocupacaoFiltro='';
    filtrarListaOcupacao('',true);sel.focus();
  });
  $('ed-atividade').addEventListener('touchstart',evento=>{
    const sel=$('ed-atividade');
    if(sel.disabled||ocupacaoAberta)return;
    evento.preventDefault();ocupacaoFiltro='';
    filtrarListaOcupacao('',true);sel.focus();
  },{passive:false});
  $('ed-atividade').addEventListener('dblclick',()=>{
    if(ocupacaoAberta)registrarOcupacaoSelecionada();
  });
  $('ed-atividade').addEventListener('change',registrarOcupacaoSelecionada);
  $('ed-atividade').addEventListener('blur',()=>{
    // Fecha a lista sem apagar a ocupação efetivamente selecionada.
    setTimeout(()=>{if(ocupacaoAberta)fecharListaOcupacao();},120);
  });
  function renderProdutos(){
    const ed=buscar();$('ed-produtos').replaceChildren();
    const grupoJ=catalogo.filter(r=>r.grupo==='J');
    for(const p of ed.produtos){
      const tr=document.createElement('tr');tr.dataset.prodId=String(p.id);
      const tdP=document.createElement('td'), sel=document.createElement('select');sel.setAttribute('aria-label','Produto armazenado');
      choices(sel,grupoJ.map(r=>[r.id,r.descricao]),p.produto,'Selecione o produto');sel.disabled=!pronto;
      sel.addEventListener('change',()=>{p.produto=sel.value;renderProdutos();agendarClassificacao();});tdP.appendChild(sel);
      const tdA=document.createElement('td'),alt=document.createElement('input');alt.type='text';alt.inputMode='decimal';alt.placeholder='Ex.: 4,50';alt.value=String(p.altura||'');
      alt.setAttribute('aria-label','Altura de armazenamento em metros');alt.addEventListener('input',()=>{p.altura=alt.value;agendarClassificacao();});tdA.appendChild(alt);
      const tdQ=document.createElement('td');tdQ.className='ed-result-value';tdQ.textContent='—';
      const tdD=document.createElement('td'),b=document.createElement('button');b.type='button';b.className='ed-removeprod';b.textContent='Remover';b.addEventListener('click',()=>{ed.produtos=ed.produtos.filter(x=>x.id!==p.id);renderProdutos();agendarClassificacao();});tdD.appendChild(b);
      tr.append(tdP,tdA,tdQ,tdD);$('ed-produtos').append(tr);
    }
    $('ed-qtdprod').textContent=ed.produtos.length+' produto(s) cadastrado(s)';
  }
  function render(){
    cards();const ed=buscar();
    $('ed-nome').value=ed.nome;$('ed-area').value=ed.area;
    grupoOptions();ocupacaoOptions();$('ed-j').hidden=ed.grupo!=='J';
    $('ed-ajustar').checked=ed.ajuste;$('ed-ajuste-conteudo').hidden=!ed.ajuste;
    $('ed-cargaManual').value=ed.cargaManual;$('ed-justificativa').value=ed.justificativa;
    if(ed.grupo==='J')renderProdutos();
    atualizarResultado(null);agendarClassificacao();
  }
  async function getClient(){
    if(!promiseClient)promiseClient=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(m=>m.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));
    return promiseClient;
  }
  async function enviar(operacao,dados){
    if(!URL_BASE||!URL_BASE.startsWith('https://'))throw new Error('Configuração da API oficial indisponível.');
    const sb=await getClient();const {data:{session},error}=await sb.auth.getSession();
    if(error||!session?.access_token)throw new Error('Sessão expirada. Entre novamente no SAR.');
    const c=new AbortController(),time=setTimeout(()=>c.abort(),20000);
    try{
      const response=await fetch(URL_BASE+ENDPOINT,{method:'POST',headers:{'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({operacao,dados}),signal:c.signal,credentials:'omit',cache:'no-store'});
      const body=await response.json().catch(()=>null);
      if(!response.ok||body?.sucesso!==true)throw new Error(body?.mensagem||body?.detail||`API indisponível (${response.status}).`);
      return body.resultado;
    }catch(e){if(e.name==='AbortError')throw new Error('A API não respondeu. Verifique o Railway.');throw e;}finally{clearTimeout(time)}
  }
  async function carregarReferencias(){
    estadoFonte('Conectando ao Cadastro Central de Ocupações e Atividades do SAR...');
    mensagem('Buscando atividades e produtos no banco...');
    try{
      const resultado=await enviar('listar_referencias',{uf:'SP'});
      if(!Array.isArray(resultado?.atividades)||!Array.isArray(resultado?.grupos))throw new Error('Catálogo retornou formato inesperado.');
      catalogo=resultado.atividades;grupos=[...new Map(resultado.grupos.filter(g=>g.codigo).map(g=>[g.codigo,g])).values()].sort((a,b)=>a.codigo.localeCompare(b.codigo));
      if(!catalogo.length)throw new Error('O Cadastro Central está vazio ou indisponível.');
      pronto=true;estadoFonte(`Cadastro Central do SAR: ${catalogo.length} atividades e produtos ativos consultados. Classificações realizadas pelo backend oficial, sem cálculos no navegador.`);
      render();mensagem(`${catalogo.length} atividades e produtos disponíveis. Selecione uma ocupação.`);
    }catch(e){
      pronto=false;grupoOptions();estadoFonte('API oficial indisponível ou acesso não autorizado. Não foram utilizados valores demonstrativos; a classificação permanece bloqueada.');
      mensagem(e.message||'Falha ao consultar os cadastros.',true);
    }
  }
  let apiSeq=0;
  function agendarClassificacao(){
    clearTimeout(temporizador);const seq=++sequencia;apiSeq=seq;atualizarResultado(null);
    if(!pronto)return;
    const ed=buscar();if(!ed?.grupo)return;
    if(ed.grupo==='J'&&!ed.produtos.some(p=>p.produto))return;
    if(ed.grupo!=='J'&&!ed.atividade)return;
    if(ed.ajuste&&(!ed.cargaManual||ed.justificativa.trim().length<10)){
      mensagem('Para ajustar a carga, informe valor e justificativa técnica com ao menos 10 caracteres.',true);return;
    }
    temporizador=setTimeout(()=>classificarAtiva(seq),350);
  }
  async function classificarAtiva(seq){
    const ed=buscar(),edId=ed.id;
    let payload={uf:'SP',grupo:ed.grupo};
    if(ed.grupo==='J'){
      if(ed.produtos.some(p=>!p.produto||!catalogo.some(r=>String(r.id)===String(p.produto)))){
        mensagem('Selecione todos os produtos armazenados antes de classificar.',true);return;
      }
      const itens=ed.produtos.map(p=>{const r=catalogo.find(c=>String(c.id)===String(p.produto));return {atividade_id:Number(p.produto), ...(r?.divisao_direta==='J-1'?{}:{altura_m:p.altura})};});
      if(itens.some((p,i)=>p.altura_m!==undefined&&!(numBR(p.altura_m)>0))){mensagem('Informe altura positiva em metros para cada produto armazenado.',true);return;}
      payload.produtos=itens;
    }else payload.atividade_id=Number(ed.atividade);
    if(ed.ajuste){payload.carga_manual_mj_m2=ed.cargaManual;payload.justificativa=ed.justificativa;}
    mensagem('Classificando no motor SAR...');
    try{
      const resposta=await enviar('classificar',payload);
      if(seq!==apiSeq||ativo!==edId)return;
      atualizarResultado(resposta);mensagem(`Classificação concluída no Railway. Regra: ${resposta.referencia_risco||'Cadastro Central SAR'}.`);
    }catch(e){if(seq!==apiSeq||ativo!==edId)return;atualizarResultado(null);mensagem(e.message||'Falha ao classificar.',true);}
  }
  $('ed-add').addEventListener('click',()=>{if(eds.length>=30){mensagem('Limite de 30 edificações por estudo.',true);return;}const ed=novo(nextEd++,'Edificação '+(eds.length+1));eds.push(ed);ativo=ed.id;render();$('ed-nome').focus();});
  $('ed-remove').addEventListener('click',()=>{if(eds.length<=1)return;const ed=buscar();if(!confirm('Excluir '+(ed.nome||'a edificação')+' do estudo?'))return;eds=eds.filter(x=>x.id!==ed.id);ativo=eds[0].id;render();});
  $('ed-nome').addEventListener('input',e=>{buscar().nome=e.target.value;cards();});
  $('ed-area').addEventListener('input',e=>{buscar().area=e.target.value;});
  $('ed-area').addEventListener('blur',e=>{if(!e.target.value.trim())return;const v=numBR(e.target.value);if(v===null){mensagem('Área protegida inválida.',true);return;}e.target.value=fmt(v);buscar().area=e.target.value;});
  $('ed-grupo').addEventListener('change',e=>{const ed=buscar();ed.grupo=e.target.value;ed.divisao='';ed.atividade='';ed.ajuste=false;ed.cargaManual='';ed.justificativa='';ed.produtos=[];if(ed.grupo==='J')ed.produtos.push({id:nextProd++,produto:'',altura:''});render();});
  // Divisão preenchida pelo motor / registro de ocupação, sem controle visual próprio.
  $('ed-addprod').addEventListener('click',()=>{const ed=buscar();if(ed.produtos.length>=40){mensagem('Limite de 40 produtos.',true);return;}ed.produtos.push({id:nextProd++,produto:'',altura:''});renderProdutos();agendarClassificacao();});
  $('ed-ajustar').addEventListener('change',e=>{buscar().ajuste=e.target.checked;$('ed-ajuste-conteudo').hidden=!e.target.checked;agendarClassificacao();});
  $('ed-cargaManual').addEventListener('input',e=>{buscar().cargaManual=e.target.value;agendarClassificacao();});
  $('ed-justificativa').addEventListener('input',e=>{buscar().justificativa=e.target.value;agendarClassificacao();});
  function coletar(){return {edificacaoAtiva:ativo,edificacoes:eds.map(e=>({id:e.id,nome:e.nome,area:e.area,grupo:e.grupo,divisao:e.divisao,atividade:e.atividade,produtos:e.produtos.map(p=>({id:p.id,produto:String(p.produto),altura:String(p.altura)})),ajuste:!!e.ajuste,cargaManual:e.cargaManual,justificativa:e.justificativa}))};}
  function aplicar(dados){
    if(!dados||!Array.isArray(dados.edificacoes)||dados.edificacoes.length<1||dados.edificacoes.length>30)throw new Error('JSON: cadastro de edificações inválido.');
    const ids=new Set(),pr=new Set();
    const novas=dados.edificacoes.map((e,i)=>{
      if(!Number.isSafeInteger(e.id)||e.id<=0||ids.has(e.id))throw new Error('JSON: ID de edificação duplicado/inválido.');ids.add(e.id);
      for(const key of ['nome','area','grupo','divisao','atividade','cargaManual','justificativa'])if(typeof e[key]!=='string'||e[key].length>5000)throw new Error('JSON: campo inválido: '+key);
      if(typeof e.ajuste!=='boolean'||!Array.isArray(e.produtos)||e.produtos.length>40)throw new Error('JSON: produtos inválidos.');
      const p=e.produtos.map(q=>{if(!Number.isSafeInteger(q.id)||q.id<1||pr.has(q.id))throw new Error('JSON: ID de produto inválido.');pr.add(q.id);return {id:q.id,produto:String(q.produto||'').slice(0,100),altura:String(q.altura??'').slice(0,25)}});
      return {...novo(e.id,e.nome),area:e.area,grupo:e.grupo,divisao:e.divisao,atividade:e.atividade,produtos:p,ajuste:e.ajuste,cargaManual:e.cargaManual,justificativa:e.justificativa};
    });
    if(!ids.has(dados.edificacaoAtiva))throw new Error('JSON: edificação selecionada inválida.');
    eds=novas;ativo=dados.edificacaoAtiva;nextEd=Math.max(...eds.map(e=>e.id))+1;nextProd=Math.max(0,...eds.flatMap(e=>e.produtos.map(p=>p.id)))+1;render();
  }
  window.SARHidrantesEdificacoes=Object.freeze({coletar,aplicar});
  render();
  // A autorização é verificada em sar.page-guard.js e novamente no backend em cada operação.
  if(document.documentElement.getAttribute('data-sar-autorizado')==='true')carregarReferencias();
  else window.addEventListener('sar:pagina-autorizada',carregarReferencias,{once:true});
})();
