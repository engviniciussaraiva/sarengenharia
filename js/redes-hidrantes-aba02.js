/* SAR — Hidrantes / Aba 02: Ocupação / Uso.
 * UI baseada no bloco Ocupação / Uso do CLASSV01.html (mesmo visual).
 * Sem regras normativas no navegador; todas as classificações vêm da API SAR.
 * Compatível com os estudos JSON anteriores (Aba 02).
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const ENDPOINT='/api/incendio/hidrantes/edificacoes';
  const URL_BASE=window.SAR_API_CONFIG?.API_BASE_URL;
  const SUPABASE_URL='https://bjtxbpmrmhfvpmdsthxr.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM';
  const fmt=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const numBR=v=>{const raw=String(v??'').trim().replace(/\s/g,'');if(!raw)return null;const n=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);return Number.isFinite(n)&&n>=0?n:null;};
  const opt=(label,value)=>new Option(String(label),String(value));
  const norm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const novo=(id,nome)=>({id,nome,area:'',grupo:'',divisao:'',atividade:'',produtos:[],ajuste:false,cargaManual:'',justificativa:'',ocupacaoUnica:true,ocupacoes:[]});
  let eds=[],ativo=null,nextEd=1,nextOcc=1;
  let catalogo=[],grupos=[],pronto=false,apiSeq=0,temporizador=null;
  let promiseClient=null;
  let resultadoAtual=null;
  const buscar=()=>eds.find(e=>e.id===ativo);
  const getRecord=id=>catalogo.find(r=>String(r.id)===String(id));
  const rotuloRegistro=r=>[r.descricao||'Sem descrição',r.divisao_direta||r.divisao_referencia||'',r.carga_incendio_m2!=null?fmt(r.carga_incendio_m2)+' MJ/m²':''].filter(Boolean).join(' | ');
  function mensagem(texto,erro=false){const el=$('ed-status');el.textContent=texto||'';el.style.color=erro?'#b71c1c':'#1b5e20';}
  function estadoFonte(texto){$('ed-fonte').textContent=texto;}
  function optionsUso(select,valor=''){
    select.replaceChildren(opt(pronto?'-- Selecione o uso --':'Carregando cadastros...',''),...grupos.map(g=>opt(g.codigo+' — '+(g.nome||'Ocupação'),g.codigo)));
    select.value=valor||'';select.disabled=!pronto;
  }
  function renderCards(){
    $('ed-list').replaceChildren(...eds.map((ed,i)=>{
      const b=document.createElement('button');b.type='button';b.className='ed-chip'+(ed.id===ativo?' selected':'');
      b.textContent=ed.nome.trim()||'Edificação '+(i+1);b.setAttribute('aria-pressed',String(ed.id===ativo));
      b.addEventListener('click',()=>{ativo=ed.id;render();});return b;
    }));
    $('ed-count').textContent=String(eds.length);$('ed-total').hidden=eds.length===0;
    $('ed-list').hidden=eds.length===0;$('ed-topline').classList.toggle('empty',eds.length===0);
  }
  function limparResultado(){
    resultadoAtual=null;
    $('ed-resultado-divisao').textContent='Não classificada';
    $('ed-resultado-risco').textContent='A determinar';$('ed-resultado-risco').className='ed-risk';
    $('ed-resultado-carga').textContent='—';$('ed-carga').value='';
  }
  function atualizarResultado(res){
    resultadoAtual=res||null;
    const div=res?.divisao||'A determinar',risco=res?.risco||'A determinar',q=res?.carga_adotada_mj_m2;
    $('ed-resultado-divisao').textContent=div;
    $('ed-resultado-risco').textContent=risco;
    $('ed-resultado-risco').className='ed-risk '+({'Baixo':'baixo','Médio':'medio','Alto':'alto'}[risco]||'');
    $('ed-resultado-carga').textContent=q==null?'—':fmt(q);
    $('ed-carga').value=q==null?'':fmt(q);
    const ed=buscar();if(ed)ed.divisao=div==='A determinar'?'':div;
    renderPredominante();
  }
  const registrosPorUso=uso=>catalogo.filter(r=>r.grupo===uso);
  const alturaExigida=r=>!!r && r.grupo==='J' && r.divisao_direta!=='J-1' && (Number(r.carga_incendio_m)||r.metodo_calculo_mj==='por_metro');
  const autoc={
    unico:{uso:'ed-grupo',input:'ed-atividade',list:'ed-lista-busca',height:'ed-altura',selecionado:null,idx:-1,registros:[]},
    misto:{uso:'ed-grupo-misto',input:'ed-atividade-misto',list:'ed-lista-busca-misto',height:'ed-altura-misto',selecionado:null,idx:-1,registros:[]}
  };
  function ocultarSugestoes(cfg){$(cfg.list).hidden=true;$(cfg.input).setAttribute('aria-expanded','false');cfg.idx=-1;}
  function limparBusca(cfg){cfg.selecionado=null;$(cfg.input).value='';$(cfg.height).value='0,00';$(cfg.height).disabled=true;ocultarSugestoes(cfg);}
  function atualizarAltura(cfg){
    const req=alturaExigida(cfg.selecionado);
    $(cfg.height).disabled=!req;
    if(!req)$(cfg.height).value='0,00';
  }
  function selecionarSugestao(cfg,r){cfg.selecionado=r;$(cfg.uso).value=r.grupo;$(cfg.input).value=r.descricao;atualizarAltura(cfg);ocultarSugestoes(cfg);}
  function listarSugestoes(cfg,termo){
    const lista=$(cfg.list),uso=$(cfg.uso).value;
    lista.replaceChildren();cfg.registros=[];
    if(!uso||!pronto){ocultarSugestoes(cfg);return;}
    const q=norm(termo);
    cfg.registros=registrosPorUso(uso).filter(r=>!q||norm(rotuloRegistro(r)).includes(q)).sort((a,b)=>String(a.descricao).localeCompare(String(b.descricao),'pt-BR',{sensitivity:'base'})).slice(0,70);
    if(!cfg.registros.length){const v=document.createElement('div');v.className='ed-busca-vazia';v.textContent='Nenhuma ocupação encontrada.';lista.append(v);}
    cfg.registros.forEach((r,i)=>{const b=document.createElement('button');b.type='button';b.role='option';b.textContent=rotuloRegistro(r);b.setAttribute('aria-selected','false');
      b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>selecionarSugestao(cfg,r));lista.append(b);
    });
    cfg.idx=-1;lista.hidden=false;$(cfg.input).setAttribute('aria-expanded','true');
  }
  function conectarBusca(cfg){
    $(cfg.uso).addEventListener('change',()=>{limparBusca(cfg);});
    $(cfg.input).addEventListener('focus',()=>listarSugestoes(cfg,$(cfg.input).value));
    $(cfg.input).addEventListener('input',()=>{cfg.selecionado=null;atualizarAltura(cfg);listarSugestoes(cfg,$(cfg.input).value);});
    $(cfg.input).addEventListener('keydown',e=>{
      const lista=$(cfg.list);
      if(e.key==='Escape'){ocultarSugestoes(cfg);return;}
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!lista.hidden){
        e.preventDefault();const n=cfg.registros.length;if(!n)return;
        cfg.idx=(cfg.idx+(e.key==='ArrowDown'?1:-1)+n)%n;
        lista.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-selected',String(i===cfg.idx)));
        lista.querySelectorAll('button')[cfg.idx]?.scrollIntoView({block:'nearest'});
      }else if(e.key==='Enter'&&!lista.hidden){
        e.preventDefault();const r=cfg.registros[cfg.idx>=0?cfg.idx:0];if(r)selecionarSugestao(cfg,r);
      }
    });
    $(cfg.input).addEventListener('blur',()=>setTimeout(()=>ocultarSugestoes(cfg),120));
  }
  conectarBusca(autoc.unico);conectarBusca(autoc.misto);
  function escolherPredominanteVisual(ed){
    if(!ed?.ocupacoes?.length)return 'Aguardando cadastro de ocupações.';
    if(ed.ocupacoes.length===1)return 'Ocupação cadastrada: '+ed.ocupacoes[0].descricao+'. A classificação técnica será apresentada pelo motor SAR.';
    const exclusivamenteJ=ed.ocupacoes.every(o=>o.grupo==='J');
    if(exclusivamenteJ){
      const id=resultadoAtual?.produto_governante_id;
      const gov=ed.ocupacoes.find(o=>String(o.atividade)===String(id));
      return gov?'Produto governante conforme motor SAR: '+gov.descricao+'.':'Produtos cadastrados. O motor SAR determina a maior carga de incêndio entre eles.';
    }
    return 'Múltiplas ocupações cadastradas. O enquadramento e a ocupação predominante dependem da consolidação das regras no backend do SAR.';
  }
  function renderPredominante(){const ed=buscar();$('ed-predominante').textContent=escolherPredominanteVisual(ed);}
  function renderLista(){
    const ed=buscar(),box=$('ed-lista-ocupacoes');box.replaceChildren();
    if(!ed?.ocupacoes.length){box.textContent='Aguardando inclusão de ocupações.';renderPredominante();return;}
    ed.ocupacoes.forEach((o,i)=>{
      const row=document.createElement('div');row.className='ed-oc-item';
      const info=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');
      strong.textContent=o.descricao;
      const a=[o.grupo||'',o.divisao||''];
      if(o.pavimento)a.push(o.pavimento);
      if(o.area)a.push('Área: '+o.area+' m²');
      if(o.grupo==='J'&&o.altura)a.push('Armazenamento: '+o.altura+' m');
      small.textContent=a.filter(Boolean).join(' · ');
      info.append(strong,small);
      const b=document.createElement('button');b.type='button';b.className='ed-oc-remover';b.textContent='Remover';b.setAttribute('aria-label','Remover ocupação '+o.descricao);
      b.addEventListener('click',()=>{ed.ocupacoes.splice(i,1);sincronizarTecnicos(ed);renderLista();agendarClassificacao();});
      row.append(info,b);box.append(row);
    });renderPredominante();
  }
  function sincronizarTecnicos(ed){
    const itens=ed.ocupacoes;
    ed.produtos=itens.filter(o=>o.grupo==='J').map(o=>({id:o.id,produto:String(o.atividade),altura:String(o.altura||'')}));
    const unico=itens.length===1?itens[0]:null;
    ed.grupo=unico?.grupo|| (itens.length&&itens.every(o=>o.grupo==='J')?'J':'');
    ed.atividade=unico?.atividade||'';
    ed.divisao=unico?.divisao||'';
  }
  function limparRascunho(){for(const cfg of Object.values(autoc)){limparBusca(cfg);} $('ed-grupo').value='';$('ed-grupo-misto').value='';$('ed-pavimento').value='';$('ed-area-ocupacao').value='';}
  function render(){
    renderCards();const ed=buscar();
    if(!ed){clearTimeout(temporizador);apiSeq++;$('ed-editor').hidden=true;$('ed-ocupacao-card').open=false;return;}
    $('ed-editor').hidden=false;
    $('ed-nome').value=ed.nome;$('ed-area').value=ed.area;
    $('ed-ocupacao-card').open=false; // sempre recolhida ao selecionar/abrir uma edificação
    $('ed-ocupacao-unica').checked=ed.ocupacaoUnica!==false;
    alternarModo(false);
    optionsUso($('ed-grupo'));optionsUso($('ed-grupo-misto'));
    limparRascunho();
    $('ed-ajustar').checked=ed.ajuste;$('ed-ajuste-conteudo').hidden=!ed.ajuste;
    $('ed-cargaManual').value=ed.cargaManual;$('ed-justificativa').value=ed.justificativa;
    limparResultado();renderLista();agendarClassificacao();
  }
  function alternarModo(atualizar=true){
    const unico=$('ed-ocupacao-unica').checked;
    $('ed-bloco-unico').hidden=!unico;$('ed-bloco-misto').hidden=unico;
    if(atualizar){const ed=buscar();if(ed)ed.ocupacaoUnica=unico;limparRascunho();}
  }
  $('ed-ocupacao-unica').addEventListener('change',()=>alternarModo());
  function adicionarOcupacao(modo){
    const ed=buscar();if(!ed)return;
    if(ed.ocupacoes.length>=40){mensagem('Máximo de 40 ocupações por edificação.',true);return;}
    const cfg=autoc[modo],r=cfg.selecionado;
    if(!pronto||!r){mensagem('Selecione o uso e uma ocupação da lista.',true);$(cfg.input).focus();return;}
    const req=alturaExigida(r),altura=req?String($(cfg.height).value).trim():'';
    if(req&&!(numBR(altura)>0)){mensagem('Informe a altura de armazenamento positiva em metros.',true);$(cfg.height).focus();return;}
    const pavimento=modo==='misto'?$('ed-pavimento').value.trim():'';
    const area=modo==='misto'?$('ed-area-ocupacao').value.trim():'';
    if(modo==='misto'&&!pavimento){mensagem('Identifique o pavimento ou setor da ocupação.',true);return;}
    if(modo==='misto'&&!(numBR(area)>0)){mensagem('Informe a área positiva da ocupação.',true);return;}
    if(ed.ocupacoes.some(o=>o.grupo===r.grupo&&o.atividade===String(r.id)&&o.pavimento===pavimento&&o.altura===altura)){
      mensagem('Esta ocupação já foi adicionada com os mesmos parâmetros.',true);return;
    }
    ed.ocupacoes.push({id:nextOcc++,grupo:r.grupo,atividade:String(r.id),descricao:r.descricao,divisao:r.divisao_direta||r.divisao_referencia||'',altura,pavimento,area:area?fmt(numBR(area)):''});
    sincronizarTecnicos(ed);renderLista();agendarClassificacao();
    limparBusca(cfg);$(cfg.input).focus();mensagem('Ocupação adicionada à edificação.');
  }
  $('ed-add-ocupacao').addEventListener('click',()=>adicionarOcupacao('unico'));
  $('ed-add-ocupacao-mista').addEventListener('click',()=>adicionarOcupacao('misto'));
  $('ed-limpar-ocupacoes').addEventListener('click',()=>{
    const ed=buscar();if(!ed?.ocupacoes.length)return;
    if(!confirm('Remover todas as ocupações cadastradas nesta edificação?'))return;
    ed.ocupacoes=[];sincronizarTecnicos(ed);renderLista();agendarClassificacao();
  });
  async function getClient(){
    if(!promiseClient)promiseClient=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(m=>m.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));
    return promiseClient;
  }
  async function enviar(operacao,dados){
    if(!URL_BASE||!URL_BASE.startsWith('https://'))throw new Error('Configuração da API oficial indisponível.');
    const sb=await getClient(),{data:{session},error}=await sb.auth.getSession();
    if(error||!session?.access_token)throw new Error('Sessão expirada. Entre novamente no SAR.');
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
    try{
      const r=await fetch(URL_BASE+ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({operacao,dados}),signal:ctrl.signal,credentials:'omit',cache:'no-store'});
      const body=await r.json().catch(()=>null);
      if(!r.ok||body?.sucesso!==true)throw new Error(body?.mensagem||body?.detail||`API indisponível (${r.status}).`);
      return body.resultado;
    }catch(e){if(e.name==='AbortError')throw new Error('A API não respondeu. Verifique o Railway.');throw e;}finally{clearTimeout(timer);}
  }
  async function carregarReferencias(){
    estadoFonte('Conectando ao Cadastro Central de Ocupações e Atividades do SAR...');mensagem('Buscando cadastros na API oficial...');
    try{
      const resultado=await enviar('listar_referencias',{uf:'SP'});
      if(!Array.isArray(resultado?.atividades)||!Array.isArray(resultado?.grupos))throw new Error('Catálogo retornou formato inesperado.');
      catalogo=resultado.atividades;grupos=[...new Map(resultado.grupos.filter(g=>g.codigo).map(g=>[g.codigo,g])).values()].sort((a,b)=>a.codigo.localeCompare(b.codigo));
      if(!catalogo.length)throw new Error('O Cadastro Central está vazio ou indisponível.');
      pronto=true;estadoFonte('Cadastro Central SAR: '+catalogo.length+' atividades e produtos. Classificações efetuadas somente pelo backend oficial.');
      optionsUso($('ed-grupo'));optionsUso($('ed-grupo-misto'));
      mensagem('Ocupações disponíveis. Clique em + Cadastrar Edificação.');
    }catch(e){pronto=false;estadoFonte('API oficial indisponível ou acesso não autorizado; nenhuma classificação local foi feita.');mensagem(e.message||'Falha ao carregar o catálogo.',true);}
  }
  function agendarClassificacao(){
    clearTimeout(temporizador);const seq=++apiSeq;
    limparResultado();
    if(!pronto)return;
    const ed=buscar();if(!ed||!ed.ocupacoes.length)return;
    const allJ=ed.ocupacoes.every(o=>o.grupo==='J');
    if(ed.ocupacoes.length>1&&!allJ){mensagem('Várias ocupações: aguardando consolidação normativa no motor do SAR. Dados preservados no JSON.',true);return;}
    if(ed.ajuste&&(!ed.cargaManual||ed.justificativa.trim().length<10)){
      mensagem('Ajuste de carga exige valor e justificativa técnica de pelo menos 10 caracteres.',true);return;
    }
    temporizador=setTimeout(()=>classificarAtiva(seq),320);
  }
  async function classificarAtiva(seq){
    const ed=buscar(),id=ed?.id;if(!ed)return;
    const allJ=ed.ocupacoes.every(o=>o.grupo==='J');
    let dados={uf:'SP',grupo:allJ?'J':ed.ocupacoes[0].grupo};
    if(allJ){
      dados.produtos=ed.ocupacoes.map(o=>({atividade_id:Number(o.atividade),...(getRecord(o.atividade)?.divisao_direta==='J-1'?{}:{altura_m:o.altura})}));
      if(dados.produtos.some(p=>p.altura_m!==undefined&&!(numBR(p.altura_m)>0))){mensagem('Informe altura válida para os produtos de depósito.',true);return;}
    }else dados.atividade_id=Number(ed.ocupacoes[0].atividade);
    if(ed.ajuste){dados.carga_manual_mj_m2=ed.cargaManual;dados.justificativa=ed.justificativa;}
    mensagem('Classificando no motor SAR...');
    try{
      const resposta=await enviar('classificar',dados);
      if(seq!==apiSeq||ativo!==id)return;
      atualizarResultado(resposta);mensagem('Classificação concluída no backend SAR.');
    }catch(e){if(seq!==apiSeq||ativo!==id)return;limparResultado();mensagem(e.message||'Falha ao classificar.',true);}
  }
  $('ed-add').addEventListener('click',()=>{
    if(eds.length>=30){mensagem('Limite de 30 edificações por estudo.',true);return;}
    const ed=novo(nextEd++,'Edificação '+(eds.length+1));eds.push(ed);ativo=ed.id;render();$('ed-nome').focus();
  });
  $('ed-remove').addEventListener('click',()=>{
    const ed=buscar();if(!ed)return;
    if(!confirm('Excluir '+(ed.nome||'a edificação')+' do estudo?'))return;
    eds=eds.filter(e=>e.id!==ed.id);ativo=eds[0]?.id??null;render();
  });
  $('ed-nome').addEventListener('input',e=>{const ed=buscar();if(ed){ed.nome=e.target.value;renderCards();}});
  $('ed-area').addEventListener('input',e=>{const ed=buscar();if(ed)ed.area=e.target.value;});
  $('ed-area').addEventListener('blur',e=>{if(!e.target.value.trim())return;const q=numBR(e.target.value);if(q===null){mensagem('Área protegida inválida.',true);return;}e.target.value=fmt(q);buscar().area=e.target.value;});
  $('ed-ajustar').addEventListener('change',e=>{const ed=buscar();if(ed){ed.ajuste=e.target.checked;$('ed-ajuste-conteudo').hidden=!e.target.checked;agendarClassificacao();}});
  $('ed-cargaManual').addEventListener('input',e=>{const ed=buscar();if(ed){ed.cargaManual=e.target.value;agendarClassificacao();}});
  $('ed-justificativa').addEventListener('input',e=>{const ed=buscar();if(ed){ed.justificativa=e.target.value;agendarClassificacao();}});
  function coletar(){return {edificacaoAtiva:ativo,edificacoes:eds.map(e=>({
    id:e.id,nome:e.nome,area:e.area,grupo:e.grupo,divisao:e.divisao,atividade:e.atividade,
    produtos:e.produtos.map(p=>({id:p.id,produto:String(p.produto),altura:String(p.altura)})),
    ajuste:!!e.ajuste,cargaManual:e.cargaManual,justificativa:e.justificativa,
    ocupacaoUnica:e.ocupacaoUnica!==false,
    ocupacoes:e.ocupacoes.map(o=>({...o}))
  }))};}
  function aplicar(dados){
    if(!dados||!Array.isArray(dados.edificacoes)||dados.edificacoes.length>30)throw new Error('JSON: cadastro de edificações inválido.');
    const ids=new Set(),occs=new Set();
    const novas=dados.edificacoes.map(e=>{
      if(!Number.isSafeInteger(e.id)||e.id<=0||ids.has(e.id))throw new Error('JSON: ID de edificação duplicado/inválido.');ids.add(e.id);
      for(const k of ['nome','area','grupo','divisao','atividade','cargaManual','justificativa'])if(typeof e[k]!=='string'||e[k].length>5000)throw new Error('JSON: campo inválido: '+k);
      if(typeof e.ajuste!=='boolean'||!Array.isArray(e.produtos)||e.produtos.length>40)throw new Error('JSON: produtos inválidos.');
      const n=novo(e.id,e.nome);
      Object.assign(n,{area:e.area,grupo:e.grupo,divisao:e.divisao,atividade:e.atividade,ajuste:e.ajuste,cargaManual:e.cargaManual,justificativa:e.justificativa,ocupacaoUnica:e.ocupacaoUnica!==false});
      if(Array.isArray(e.ocupacoes)){
        if(e.ocupacoes.length>40)throw new Error('JSON: quantidade de ocupações inválida.');
        n.ocupacoes=e.ocupacoes.map(o=>{
          if(!Number.isSafeInteger(o.id)||o.id<=0||occs.has(o.id))throw new Error('JSON: ID de ocupação inválido.');occs.add(o.id);
          if(!o.grupo||!o.atividade||typeof o.descricao!=='string')throw new Error('JSON: registro de ocupação inválido.');
          return {id:o.id,grupo:String(o.grupo).slice(0,20),atividade:String(o.atividade).slice(0,30),descricao:o.descricao.slice(0,500),divisao:String(o.divisao||''),altura:String(o.altura||''),pavimento:String(o.pavimento||'').slice(0,100),area:String(o.area||'')};
        });
      }else if(e.produtos?.length){
        n.ocupacoes=e.produtos.filter(p=>p.produto).map(p=>{
          const r=getRecord(p.produto);const id=nextOcc++;
          return {id,grupo:'J',atividade:String(p.produto),descricao:r?.descricao||'Produto '+p.produto,divisao:r?.divisao_direta||'',altura:String(p.altura||''),pavimento:'',area:''};
        });
      }else if(e.grupo&&e.atividade){
        const r=getRecord(e.atividade);n.ocupacoes=[{id:nextOcc++,grupo:e.grupo,atividade:String(e.atividade),descricao:r?.descricao||'Ocupação '+e.atividade,divisao:e.divisao||'',altura:'',pavimento:'',area:''}];
      }
      sincronizarTecnicos(n);return n;
    });
    if(novas.length&&!ids.has(dados.edificacaoAtiva))throw new Error('JSON: edificação selecionada inválida.');
    eds=novas;ativo=novas.length?dados.edificacaoAtiva:null;
    nextEd=Math.max(0,...eds.map(e=>e.id))+1;nextOcc=Math.max(nextOcc,1,...eds.flatMap(e=>e.ocupacoes.map(o=>o.id+1)));
    render();
  }
  window.SARHidrantesEdificacoes=Object.freeze({coletar,aplicar});
  render();
  if(document.documentElement.getAttribute('data-sar-autorizado')==='true')carregarReferencias();
  else window.addEventListener('sar:pagina-autorizada',carregarReferencias,{once:true});
})();
