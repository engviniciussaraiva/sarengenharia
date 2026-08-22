const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const parseNumber=v=>{
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  const text=String(v??'').trim();
  if(!text)return null;
  const normalized=text.includes(',')?text.replace(/\./g,'').replace(',','.'):text;
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:null;
};
const num=v=>parseNumber(v)??0;
const fmt=(v,d=2)=>(parseNumber(v)??0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const INTEGER_KEYS=new Set(['chamberCount','lineCount']);
const NUMERIC_TANK_KEYS=new Set([
  'diameter','height','length','usefulVolume','baseDiameter','baseHeight','baseVolume',
  'foamRate','foamTime','foamArea','lgePercent',
  'sealWidth',
  'lgeReserveLiters','chamberCount','lineCount','lineFlow','lineTime','coolingOwnRate',
  'coolingNeighborRate','coolingTime','requiredPressure'
]);
const inputNumberValue=(v,integer=false)=>{
  const parsed=parseNumber(v);
  if(parsed===null)return '';
  return integer?String(Math.round(parsed)):fmt(parsed);
};
function prepareNumericInput(el,commit){
  const integer=el.dataset.integer==='true'||el.step==='1';
  el.type='text';
  el.inputMode=integer?'numeric':'decimal';
  el.autocomplete='off';
  if(el.value!=='')el.value=inputNumberValue(el.value,integer);
  el.onfocus=()=>{if(el.value!=='')el.value=integer?String(Math.round(num(el.value))):String(num(el.value)).replace('.',',');el.select()};
  el.oninput=()=>{el.value=el.value.replace(integer?/[^0-9-]/g:/[^0-9,.-]/g,'')};
  el.onblur=()=>{
    const parsed=parseNumber(el.value);
    el.value=parsed===null?'':inputNumberValue(parsed,integer);
    commit?.(parsed??0);
  };
  el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();el.blur()}};
}
function prepareOptionalNumericInput(el,commit){
  el.type='text';el.inputMode='decimal';el.autocomplete='off';
  if(el.value!=='')el.value=inputNumberValue(el.value);
  el.onfocus=()=>{if(el.value!=='')el.value=String(num(el.value)).replace('.',',');el.select()};
  el.oninput=()=>{el.value=el.value.replace(/[^0-9,.-]/g,'')};
  el.onblur=()=>{const parsed=parseNumber(el.value);el.value=parsed===null?'':inputNumberValue(parsed);commit?.(parsed)};
  el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();el.blur()}};
}
const STORAGE='sar.parque.tanques.mvp.v1';
const SYSTEM_STORAGE='sar.parque.tanques.multibacia.v31';
const defaults={meta:{name:'',reference:'',responsible:'',park:'',basin:''},basin:{type:'around',width:0,length:0,area:0,areaManual:false,precipitation:0,recurrenceTime:0,rain:0,freeboard:0,isolation:0,secondaryFoamRate:0,secondaryMinimumFlow:0,secondaryLineCount:1,secondaryFoamTime:0,secondaryLgePercent:3,basinFoamMethod:'camera',basinFoamLgePercent:3,basinFoamNormative:null,basinFoamPending:false,basinFoamError:''},tanks:[],distances:{},neighborAnalysis:{}};
let state,system,selectedScenario=null,productCatalog=[],thermalClassifier=null,distanceAnalyzer=null,verticalFoamEngine=null,basinFoamEngine=null,coolingEngine=null;
const coolingRequestTokens=new Map();
function tank(i={}){return {id:uid(),tag:'TQ1',orientation:'vertical',installation:'apoiado',roofType:'fixo',sealWidth:0,inertized:false,api620:false,diameter:0,height:0,length:0,usefulVolume:0,baseShape:'circular',baseDiameter:0,baseHeight:0,baseVolume:0,baseVolumeManual:false,productId:null,product:'',productScientificName:'',productSource:'',flashPoint:null,boilingPoint:null,vaporPressure:null,vaporPressureConfirmed:false,liquidClass:'',miscibilityWater:'',foamGroup:'',classificationRuleVersion:'',storageTemperature:25,storageTemperatureAssumed:true,scenarioClass:'',thermalMessages:[],thermalRuleVersion:'',thermalPending:false,thermalError:'',foamApplicationType:'',foamApplicationUserSelected:false,foamRate:0,foamTime:0,foamArea:0,lgePercent:3,lgeReserveLiters:0,equipmentModel:'',chamberCount:0,proportionerModel:'',lineCount:0,lineFlow:200,lineTime:0,foamNormative:null,foamPending:false,foamError:'',coolingMethod:'',coolingMethodUserSelected:false,coolingOwnRate:2,coolingNeighborRate:2,coolingNeighborRates:{},coolingTime:0,coolingNormative:null,coolingPending:false,coolingError:'',requiredPressure:0,...i}}
function pairKey(a,b){return [a.id,b.id].sort().join('|')}
function coordinateShellDistance(a,b){return Math.max(0,Math.hypot(num(a.x)-num(b.x),num(a.y)-num(b.y))-(num(a.diameter)+num(b.diameter))/2)}
function normalizeState(raw){
  const next={...structuredClone(defaults),...(raw||{})};
  next.meta={...defaults.meta,...(raw?.meta||{})};next.basin={...defaults.basin,...(raw?.basin||{})};next.tanks=(raw?.tanks||[]).map(item=>tank(item));next.distances={...(raw?.distances||{})};next.neighborAnalysis={...(raw?.neighborAnalysis||{})};
  Object.keys(defaults.basin).forEach(key=>{
    if(typeof defaults.basin[key]==='number')next.basin[key]=num(next.basin[key]);
  });
  next.tanks.forEach(t=>{NUMERIC_TANK_KEYS.forEach(key=>{t[key]=num(t[key])});t.coolingNeighborRates={...(t.coolingNeighborRates||{})}});
  next.distances=Object.fromEntries(
    Object.entries(next.distances)
      .map(([key,value])=>[key,parseNumber(value)])
      .filter(([,value])=>value!==null)
  );
  next.tanks.forEach((a,i)=>next.tanks.slice(i+1).forEach(b=>{const key=pairKey(a,b);if(next.distances[key]===undefined&&(a.x!==undefined||a.y!==undefined||b.x!==undefined||b.y!==undefined))next.distances[key]=coordinateShellDistance(a,b)}));
  return next;
}
function newBasin(seed={}){
  const next=normalizeState({...structuredClone(defaults),...seed});
  next.id=seed.id||uid();
  return next;
}
function normalizeSystem(raw){
  if(Array.isArray(raw?.basins)){
    const next={version:31,id:raw.id||uid(),activeBasinId:raw.activeBasinId,basins:raw.basins.map(b=>newBasin(b)),isolationRules:{...(raw.isolationRules||{})}};
    if(!next.basins.some(b=>b.id===next.activeBasinId))next.activeBasinId=next.basins[0]?.id||null;
    return next;
  }
  if(raw&&typeof raw==='object'){
    const imported=newBasin(raw);
    return {version:31,id:uid(),activeBasinId:imported.id,basins:[imported],isolationRules:{}};
  }
  let legacy;
  try{legacy=JSON.parse(localStorage.getItem(STORAGE))}catch{}
  const first=newBasin(legacy||{});
  return {version:31,id:uid(),activeBasinId:first.id,basins:[first],isolationRules:{}};
}
function loadSystem(){
  /*
   * A abertura direta do módulo deve começar como estudo livre e vazio.
   * Estudos gravados são recuperados exclusivamente pelo comando Abrir estudo.
   */
  return {version:31,id:uid(),activeBasinId:null,basins:[],isolationRules:{}};
}
function activateBasin(id){
  const next=system.basins.find(b=>b.id===id);if(!next)return;
  system.activeBasinId=id;state=next;selectedScenario=null;
  bindStatic();renderAll();renderBasinManager();save(false);
}
function save(renderManager=true){
  localStorage.setItem(SYSTEM_STORAGE,JSON.stringify(system));
  localStorage.setItem(STORAGE,JSON.stringify(state));
  if(renderManager)renderBasinManager();
  const status=$('#saveState');if(status){status.textContent='Salvo agora';setTimeout(()=>status.textContent='Salvo localmente',900)}
}
system=loadSystem();
state=system.basins.find(b=>b.id===system.activeBasinId)||system.basins[0]||newBasin();
function classify(t){
  return t.liquidClass||'—';
}
function normativeThermalAssessment(t){
  if(!t.productId)return {adoptedClass:t.liquidClass||'',level:'muted',label:'Selecione o produto',messages:[]};
  if(t.storageTemperatureAssumed)return {adoptedClass:t.liquidClass||'',level:'ok',label:'Classe original mantida',messages:[]};
  if(t.thermalPending)return {adoptedClass:t.scenarioClass||t.liquidClass||'',level:'muted',label:'Calculando',messages:['Reclassificação em processamento pela Vercel.']};
  if(t.thermalError)return {adoptedClass:t.liquidClass||'',level:'bad',label:'Falha na classificação',messages:[t.thermalError]};
  return {adoptedClass:t.scenarioClass||t.liquidClass||'',level:'ok',label:'Classificado',messages:Array.isArray(t.thermalMessages)?t.thermalMessages:[]};
}
async function reclassifyTankTemperature(target){
  if(!target?.productId||target.storageTemperatureAssumed)return;
  target.thermalPending=true;target.thermalError='';save(false);renderTanks();
  try{
    if(typeof thermalClassifier!=='function')throw new Error('O classificador térmico da Vercel não foi inicializado.');
    const result=await thermalClassifier({produto_id:target.productId,temperatura_considerada_c:target.storageTemperature});
    target.scenarioClass=result.classe_cenario||target.liquidClass||'';
    target.thermalMessages=Array.isArray(result.avisos)?result.avisos:[];
    target.thermalRuleVersion=result.versao_regra||'';
  }catch(error){
    target.scenarioClass=target.liquidClass||'';target.thermalMessages=[];
    target.thermalError=error instanceof Error?error.message:String(error);
    alert(`Não foi possível reclassificar ${target.tag}.\n${target.thermalError}`);
  }finally{
    target.thermalPending=false;target.foamNormative=null;target.coolingNormative=null;save(false);renderTanks();renderResults();analyzeVerticalFoam(target);analyzeAllCooling();
  }
}
const escapeText=v=>String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const miscibilityLabel=v=>({nao_miscivel:'Não miscível',miscivel:'Miscível',parcialmente_miscivel:'Parcialmente miscível',nao_identificado:'Não identificado'}[v]||'—');
const foamGroupLabel=v=>({hidrocarbonetos_nao_misciveis:'Hidrocarbonetos / não miscíveis',solventes_polares:'Solventes polares / miscíveis',pendente:'Pendente'}[v]||'—');
const technicalValue=(value,unit='')=>value===null||value===undefined||value===''?'—':`${fmt(value)}${unit}`;
function tankTotalVolume(t){
  const diameter=num(t.diameter);
  const axialDimension=t.orientation==='horizontal'?num(t.length):num(t.height);
  return Math.PI*diameter*diameter/4*axialDimension;
}
function projection(t){return t.orientation==='vertical'?Math.PI*num(t.diameter)**2/4:num(t.length)*num(t.diameter)}
function shellArea(t){return t.orientation==='vertical'?Math.PI*num(t.diameter)*num(t.height):projection(t)}
function roofArea(t){return Math.PI*num(t.diameter)**2/4}
function fireCoolingArea(t){return shellArea(t)}
function neighborCoolingArea(t){return shellArea(t)+(['fixo','interno_flutuante'].includes(t.roofType)?roofArea(t):0)}
function neighborCoolingRate(fire,t){return num(fire.coolingNeighborRates?.[t.id]??fire.coolingNeighborRate)}
function hasWindMajoration(t){return ['monitor','manual'].includes(t.foamApplicationType)}
function primaryFoam(t){
  const n=t.foamNormative;
  if(n?.dimensionado&&n.exigido)return {area:num(n.area_aplicacao_m2),rate:num(n.taxa_normativa_lpm_m2),wind:num(n.majoracao_vento_percentual),majoratedRate:num(n.taxa_adotada_lpm_m2),solutionFlow:num(n.vazao_solucao_lpm),combatLge:num(n.lge_combate_l),reserveLge:num(n.lge_reserva_l),totalLge:num(n.lge_total_l)};
  if(n?.dimensionado&&!n.exigido)return {area:0,rate:0,wind:0,majoratedRate:0,solutionFlow:0,combatLge:0,reserveLge:0,totalLge:0};
  const area=num(t.foamArea||roofArea(t)),rate=num(t.foamRate),wind=hasWindMajoration(t)?20:0;
  const majoratedRate=rate*(1+wind/100),solutionFlow=area*majoratedRate;
  const combatLge=solutionFlow*num(t.foamTime)*num(t.lgePercent)/100;
  const reserveLge=combatLge;
  return {area,rate,wind,majoratedRate,solutionFlow,combatLge,reserveLge,totalLge:combatLge*2};
}
async function analyzeVerticalFoam(target){
  if(!target||target.orientation!=='vertical'||!target.productId||!num(target.diameter)||!num(target.height)||typeof verticalFoamEngine!=='function')return;
  target.foamPending=true;target.foamError='';renderProtection();
  try{
    const totalIIIA=state.tanks.filter(t=>(t.scenarioClass||t.liquidClass)==='IIIA').reduce((sum,t)=>sum+num(t.usefulVolume),0);
    const result=await verticalFoamEngine({orientacao:target.orientation,diametro_m:target.diameter,altura_m:target.height,maior_diametro_vertical_m:Math.max(0,...state.tanks.filter(t=>t.orientation==='vertical').map(t=>num(t.diameter))),tipo_teto:target.roofType,classe_original:target.liquidClass,classe_cenario:target.scenarioClass||target.liquidClass,grupo_espuma:target.foamGroup,produto_armazenado:target.product,temperatura_c:target.storageTemperature,dosagem_lge_percentual:target.lgePercent,volume_total_classe_iiia_m3:totalIIIA,inertizado:target.inertized===true||target.inertized==='true',api_620:target.api620===true||target.api620==='true',largura_coroa_m:target.sealWidth,tipo_aplicacao_adotado:target.foamApplicationUserSelected?target.foamApplicationType:null});
    target.foamNormative=result;
    if(result.exigido){target.foamApplicationType=result.tipo_aplicacao;target.foamRate=num(result.taxa_normativa_lpm_m2);target.foamTime=num(result.tempo_minimo_min);target.foamArea=num(result.area_aplicacao_m2);target.chamberCount=num(result.quantidade_camaras)}
    else{target.foamApplicationType='isento';target.foamRate=0;target.foamTime=0;target.foamArea=0;target.chamberCount=0}
  }catch(error){target.foamNormative=null;target.foamError=error instanceof Error?error.message:String(error)}
  finally{target.foamPending=false;save(false);renderProtection();renderResults()}
}
function analyzeAllVerticalFoam(){state.tanks.filter(t=>t.orientation==='vertical').forEach(analyzeVerticalFoam);analyzeBasinFoam()}
async function analyzeBasinFoam(){
  if(typeof basinFoamEngine!=='function'||!state.tanks.length)return;
  const b=basinCalc();if(!num(b.usefulArea))return;
  state.basin.basinFoamPending=true;state.basin.basinFoamError='';renderSecondaryFoam();
  try{
    const result=await basinFoamEngine({area_util_bacia_m2:b.usefulArea,tipo_aplicacao:state.basin.basinFoamMethod,dosagem_lge_percentual:state.basin.basinFoamLgePercent,produtos:state.tanks.map(t=>({produto:t.product,classe_original:t.liquidClass,classe_cenario:t.scenarioClass||t.liquidClass,grupo_espuma:t.foamGroup,temperatura_c:t.storageTemperature}))});
    state.basin.basinFoamNormative=result;
  }catch(error){state.basin.basinFoamNormative=null;state.basin.basinFoamError=error instanceof Error?error.message:String(error)}
  finally{state.basin.basinFoamPending=false;save(false);renderSecondaryFoam();renderResults()}
}
function basinFoam(){
  const n=state.basin.basinFoamNormative;
  if(!n?.dimensionado||!n.exigido)return {required:false,area:0,rate:0,wind:0,adoptedRate:0,duration:0,solutionFlow:0,solutionVolume:0,combatLge:0,reserveLge:0,totalLge:0};
  return {required:true,area:num(n.area_aplicacao_m2),rate:num(n.taxa_normativa_lpm_m2),wind:num(n.majoracao_vento_percentual),adoptedRate:num(n.taxa_adotada_lpm_m2),duration:num(n.tempo_minimo_min),solutionFlow:num(n.vazao_solucao_lpm),solutionVolume:num(n.volume_solucao_l),combatLge:num(n.lge_combate_l),reserveLge:num(n.lge_reserva_l),totalLge:num(n.lge_total_l),product:n.produto,className:n.classe,family:n.familia,reference:n.referencia};
}
function secondaryFoam(){
  const largestDiameter=Math.max(0,...state.tanks.filter(t=>t.orientation==='vertical').map(t=>num(t.diameter)));
  const normative=state.tanks.find(t=>t.orientation==='vertical'&&t.foamNormative?.linhas_suplementares)?.foamNormative?.linhas_suplementares;
  const lineCount=num(normative?.quantidade),duration=num(normative?.tempo_minimo_min),flowPerLine=num(normative?.vazao_por_linha_lpm);
  const solutionFlow=lineCount*flowPerLine;
  const combatLge=solutionFlow*duration*num(state.basin.secondaryLgePercent)/100;
  const reserveLge=combatLge;
  const solutionVolume=solutionFlow*duration;
  return {largestDiameter,solutionFlow,lineCount,flowPerLine,duration,solutionVolume,combatLge,reserveLge,totalLge:combatLge*2};
}
function shellDistance(a,b){return num(state.distances?.[pairKey(a,b)])}
function neighbor(fire,other){
  if(fire.id===other.id)return false;
  return state.neighborAnalysis?.[fire.id]?.[other.id]?.resultado==='vizinho';
}
function neighbors(fire){return state.tanks.filter(t=>neighbor(fire,t))}
async function analyzeAllNeighbors(){
  if(typeof distanceAnalyzer!=='function'||state.tanks.length<2)return;
  try{
    const result=await distanceAnalyzer({
      tanques:state.tanks.map(t=>({id:t.id,tag:t.tag,orientacao:t.orientation,diametro_m:t.diameter})),
      distancias:Object.entries(state.distances||{}).map(([key,value])=>{const [tanque_a_id,tanque_b_id]=key.split('|');return {tanque_a_id,tanque_b_id,distancia_costado_costado_m:value}})
    });
    state.neighborAnalysis={};
    (result.analises||[]).forEach(item=>{if(!state.neighborAnalysis[item.tanque_em_chamas_id])state.neighborAnalysis[item.tanque_em_chamas_id]={};state.neighborAnalysis[item.tanque_em_chamas_id][item.tanque_analisado_id]=item});
    save(false);renderDistances();renderResults();validate();analyzeAllCooling();
  }catch(error){alert(`Não foi possível analisar a vizinhança.\n${error instanceof Error?error.message:String(error)}`)}
}
async function analyzeCoolingScenario(fire){
  if(!fire||typeof coolingEngine!=='function'||!fire.productId||!num(fire.diameter))return;
  const requestToken=(coolingRequestTokens.get(fire.id)||0)+1;coolingRequestTokens.set(fire.id,requestToken);
  const ns=fire.orientation==='horizontal'?[]:neighbors(fire);fire.coolingPending=true;fire.coolingError='';renderScenarioDetail();
  try{
    const result=await coolingEngine({tanque_em_chamas:{id:fire.id,tag:fire.tag,orientacao:fire.orientation,diametro_m:fire.diameter,altura_m:fire.height,comprimento_m:fire.length,capacidade_m3:fire.usefulVolume,tipo_teto:fire.roofType,classe_cenario:fire.scenarioClass||fire.liquidClass,metodo_adotado:fire.coolingMethodUserSelected?fire.coolingMethod:null},volume_risco_m3:num(fire.usefulVolume)+ns.reduce((s,t)=>s+num(t.usefulVolume),0),volume_total_classe_iiia_m3:state.tanks.filter(t=>(t.scenarioClass||t.liquidClass)==='IIIA').reduce((sum,t)=>sum+num(t.usefulVolume),0),vizinhos:ns.map(t=>({id:t.id,tag:t.tag,orientacao:t.orientation,diametro_m:t.diameter,altura_m:t.height,comprimento_m:t.length,tipo_teto:t.roofType,distancia_m:shellDistance(fire,t),metodo_adotado:t.coolingMethod||'monitor'}))});
    if(coolingRequestTokens.get(fire.id)!==requestToken)return;
    fire.coolingNormative=result;fire.coolingTime=num(result.tempo_minutos);if(result.metodo_adotado)fire.coolingMethod=result.metodo_adotado;
  }catch(error){if(coolingRequestTokens.get(fire.id)===requestToken){fire.coolingNormative=null;fire.coolingError=error instanceof Error?error.message:String(error)}}
  finally{if(coolingRequestTokens.get(fire.id)===requestToken){fire.coolingPending=false;save(false);renderScenarioDetail();renderResults()}}
}
function analyzeAllCooling(){state.tanks.forEach(analyzeCoolingScenario)}
function coolingMethodLabel(value){return ({manual:'Linha manual',linha:'Linha manual',monitor:'Canhão-monitor',aspersao:'Aspersão'}[value]||'—')}
function coolingMinimumLabel(value){return ({manual_ou_monitor:'Linha manual ou canhão-monitor',monitor:'Canhão-monitor',aspersao:'Aspersão',isento:'Isento'}[value]||'—')}
function coolingMethodOptions(tank){
  const minimum=tank.coolingNormative?.sistema_minimo;
  const values=minimum==='aspersao'?['aspersao']:minimum==='monitor'?['monitor','aspersao']:['manual','monitor','aspersao'];
  return values.map(value=>`<option value="${value}" ${tank.coolingMethod===value||(value==='manual'&&tank.coolingMethod==='linha')?'selected':''}>${coolingMethodLabel(value)}</option>`).join('');
}
function foamMethodLabel(value){return ({camera:'Câmara de espuma',aplicador_fixo_coroa:'Aplicador fixo na coroa',monitor:'Canhão-monitor',manual:'Linha manual',isento:'Isento'}[value]||'—')}
function foamMethodOptions(tank){
  const minimum=tank.foamNormative?.tipo_aplicacao_minimo;
  const values=minimum==='aplicador_fixo_coroa'?['aplicador_fixo_coroa']:minimum==='camera'?['camera']:minimum==='monitor'?['monitor','camera']:['manual','monitor','camera'];
  return values.map(value=>`<option value="${value}" ${tank.foamApplicationType===value?'selected':''}>${foamMethodLabel(value)}</option>`).join('');
}
function scenario(fire){
  const basinFire=fire.orientation==='horizontal';
  const ns=basinFire?[]:neighbors(fire),neighborStorage=ns.reduce((s,t)=>s+num(t.usefulVolume),0);
  const totalRiskVolume=basinFire?state.tanks.reduce((s,t)=>s+num(t.usefulVolume),0):num(fire.usefulVolume)+neighborStorage;
  if(basinFire){
    const primary={area:0,rate:0,wind:0,majoratedRate:0,solutionFlow:0,combatLge:0,reserveLge:0,totalLge:0};
    const secondary={largestDiameter:0,solutionFlow:0,lineCount:0,flowPerLine:0,duration:0,solutionVolume:0,combatLge:0,reserveLge:0,totalLge:0};
    const basinApplication=basinFoam(),foamFlow=basinApplication.solutionFlow,foamVolume=basinApplication.solutionVolume/1000,lgeVolume=basinApplication.totalLge/1000;
    return {fire,ns,neighborStorage:0,totalRiskVolume,ownCooling:0,neighborCooling:0,primary,secondary,basinApplication,foamMain:foamFlow,foamLines:0,coolingFlow:0,foamFlow,totalFlow:foamFlow,coolingVolume:0,foamVolume,totalVolume:foamVolume,lgeVolume,pressure:num(fire.requiredPressure),basinFire:true,foamCalculationPending:state.basin.basinFoamPending||!state.basin.basinFoamNormative};
  }
  const cooling=fire.coolingNormative;
  const ownCooling=cooling?.dimensionado?num(cooling.tanque_em_chamas?.vazao_lpm):fireCoolingArea(fire)*num(fire.coolingOwnRate);
  const neighborCooling=cooling?.dimensionado?num(cooling.vazao_vizinhos_lpm):ns.reduce((s,t)=>s+neighborCoolingArea(t)*neighborCoolingRate(fire,t),0);
  const primary=primaryFoam(fire),secondary=secondaryFoam();
  const foamMain=primary.solutionFlow;
  const foamLines=secondary.solutionFlow;
  const coolingFlow=ownCooling+neighborCooling, foamFlow=foamMain+foamLines;
  const coolingVolume=cooling?.dimensionado?num(cooling.volume_resfriamento_m3):coolingFlow*num(fire.coolingTime)/1000;
  const foamVolume=(foamMain*num(fire.foamTime)+secondary.solutionVolume)/1000;
  const totalVolume=coolingVolume+foamVolume;
  const lgeVolume=(primary.totalLge+secondary.totalLge)/1000;
  return {fire,ns,neighborStorage,totalRiskVolume,ownCooling,neighborCooling,primary,secondary,foamMain,foamLines,coolingFlow,foamFlow,totalFlow:coolingFlow+foamFlow,coolingVolume,foamVolume,totalVolume,lgeVolume,pressure:num(fire.requiredPressure),basinFire:false,foamCalculationPending:false}
}
function scenarios(){return state.tanks.map(scenario)}
function critical(){
  const ss=scenarios(), max=(key)=>ss.reduce((a,b)=>!a||b[key]>a[key]?b:a,null);
  return {ss,water:max('totalVolume'),flow:max('totalFlow'),pressure:max('pressure'),lge:max('lgeVolume')};
}
function withBasin(basin,callback){
  const current=state;state=basin;
  try{return callback()}finally{state=current}
}
function basinSummary(basin){
  return withBasin(basin,()=>{
    const c=critical();
    return {basin,scenarios:c.ss,water:c.water,flow:c.flow,pressure:c.pressure,lge:c.lge};
  });
}
function basinPairKey(a,b){return [a.id,b.id].sort().join('|')}
function cloneBasin(source){
  const copy=structuredClone(source),idMap=new Map();
  copy.id=uid();
  copy.tanks.forEach(t=>{const old=t.id;t.id=uid();idMap.set(old,t.id)});
  copy.tanks.forEach(t=>{
    t.coolingNeighborRates=Object.fromEntries(Object.entries(t.coolingNeighborRates||{}).map(([id,value])=>[idMap.get(id)||id,value]));
  });
  copy.distances=Object.fromEntries(Object.entries(copy.distances||{}).map(([key,value])=>[key.split('|').map(id=>idMap.get(id)||id).sort().join('|'),value]));
  const n=system.basins.length+1;
  copy.meta={...copy.meta,basin:`Bacia ${String(n).padStart(2,'0')}`};
  return newBasin(copy);
}
function renderBasinManager(){
  const host=$('#basinManagerList');if(!host)return;
  const hasBasins=system.basins.length>0;
  $('#tabs').style.display=hasBasins?'':'none';
  $$('.tab').forEach(el=>el.style.display=hasBasins?'':'none');
  if(!hasBasins){
    host.innerHTML='<div class="empty-basin-state"><b>Nenhuma bacia cadastrada.</b><span>Clique em “+ Adicionar bacia” para começar o estudo.</span></div>';
    return;
  }
  host.innerHTML=system.basins.map((b,index)=>`<article class="basin-chip ${b.id===system.activeBasinId?'active':''}" data-open-basin="${b.id}">
    <b>${b.meta.basin||`Bacia ${index+1}`}</b>
    <small>${b.tanks.length} tanque(s) · ${b.meta.park||'Sem parque'}</small>
    <div class="basin-chip-actions">
      <button type="button" title="Copiar esta bacia" data-copy-basin="${b.id}">Copiar</button>
      <button type="button" class="danger-action" title="Excluir esta bacia" data-delete-basin="${b.id}">Excluir</button>
    </div>
  </article>`).join('');
  $$('[data-open-basin]').forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;activateBasin(el.dataset.openBasin)});
  $$('[data-copy-basin]').forEach(el=>el.onclick=e=>{e.stopPropagation();const source=system.basins.find(b=>b.id===el.dataset.copyBasin);if(!source)return;const copy=cloneBasin(source);system.basins.push(copy);activateBasin(copy.id)});
  $$('[data-delete-basin]').forEach(el=>el.onclick=e=>{
    e.stopPropagation();
    const target=system.basins.find(b=>b.id===el.dataset.deleteBasin);
    if(!target||!confirm(`Excluir ${target.meta.basin||'esta bacia'} e todos os seus tanques, cálculos e cenários?\n\nEsta ação não pode ser desfeita.`))return;
    system.basins=system.basins.filter(b=>b.id!==target.id);
    system.isolationRules=Object.fromEntries(Object.entries(system.isolationRules).filter(([key])=>!key.split('|').includes(target.id)));
    const next=system.basins.find(b=>b.id===system.activeBasinId)||system.basins[0];
    if(next)activateBasin(next.id);
    else{
      system.activeBasinId=null;state=newBasin();selectedScenario=null;
      save(false);renderBasinManager();
    }
  });
}
function renderBasinIsolation(){
  const table=$('#basinIsolationMatrix'),summary=$('#basinIsolationSummary');if(!table||!summary)return;
  if(system.basins.length<2){
    table.innerHTML='<tbody><tr><td>Adicione pelo menos duas bacias para analisar o isolamento.</td></tr></tbody>';
    summary.innerHTML='';return;
  }
  const pairs=[];
  system.basins.forEach((a,i)=>system.basins.slice(i+1).forEach(b=>pairs.push({a,b,key:basinPairKey(a,b),rule:system.isolationRules[basinPairKey(a,b)]||{existing:0,required:0}})));
  table.innerHTML='<thead><tr><th>Bacia A</th><th>Bacia B</th><th>Distância existente (m)</th><th>Distância exigida (m)</th><th>Resultado</th></tr></thead><tbody>'+pairs.map(p=>{
    const complete=num(p.rule.required)>0,ok=complete&&num(p.rule.existing)>=num(p.rule.required);
    return `<tr><td><b>${p.a.meta.basin}</b></td><td><b>${p.b.meta.basin}</b></td>
      <td><input class="required" type="text" inputmode="decimal" data-numeric="true" data-basin-distance="${p.key}" data-distance-field="existing" value="${inputNumberValue(p.rule.existing)}"></td>
      <td><input class="normative" type="text" inputmode="decimal" data-numeric="true" data-basin-distance="${p.key}" data-distance-field="required" value="${inputNumberValue(p.rule.required)}"></td>
      <td class="${!complete?'muted':ok?'ok':'bad'}">${!complete?'INFORMAR REGRA':ok?'ISOLADAS — NÃO SOMAR':'NÃO ISOLADAS — COMBINAR'}</td></tr>`;
  }).join('')+'</tbody>';
  $$('[data-basin-distance]').forEach(el=>prepareNumericInput(el,value=>{
    const key=el.dataset.basinDistance;
    system.isolationRules[key]={...(system.isolationRules[key]||{}),[el.dataset.distanceField]:num(value)};
    save(false);renderBasinIsolation();renderGlobalConsolidation();
  }));
  summary.innerHTML='<div class="isolation-status-list">'+pairs.map(p=>{
    const complete=num(p.rule.required)>0,ok=complete&&num(p.rule.existing)>=num(p.rule.required);
    return `<div class="isolation-status-item ${complete?(ok?'ok':'bad'):''}"><div><span>PAR ANALISADO</span><b>${p.a.meta.basin} × ${p.b.meta.basin}</b></div><div><span>Existente</span><b>${fmt(p.rule.existing)} m</b></div><div><span>Exigida</span><b>${fmt(p.rule.required)} m</b></div><div><span>Conclusão</span><b>${!complete?'Pendente':ok?'Não somar':'Combinar'}</b></div></div>`;
  }).join('')+'</div>';
}
function renderGlobalConsolidation(){
  const table=$('#globalScenarioTable'),metrics=$('#globalCriticalMetrics'),combined=$('#combinedBasinScenarios');
  if(!table||!metrics||!combined)return;
  const rows=system.basins.flatMap(basin=>basinSummary(basin).scenarios.map(scenario=>({basin,scenario})));
  const maxBy=key=>rows.reduce((best,row)=>!best||num(row.scenario[key])>num(best.scenario[key])?row:best,null);
  const flow=maxBy('totalFlow'),water=maxBy('totalVolume'),lge=maxBy('lgeVolume'),pressure=maxBy('pressure');
  metrics.innerHTML=metric('Vazão governante',flow?`${fmt(flow.scenario.totalFlow)} L/min`:'—',flow?`${flow.basin.meta.basin} · ${flow.scenario.fire.tag}`:'')+
    metric('RTI governante',water?`${fmt(water.scenario.totalVolume)} m³`:'—',water?`${water.basin.meta.basin} · ${water.scenario.fire.tag}`:'')+
    metric('LGE governante',lge?`${fmt(lge.scenario.lgeVolume*1000)} L`:'—',lge?`${lge.basin.meta.basin} · ${lge.scenario.fire.tag}`:'')+
    metric('Pressão governante',pressure?`${fmt(pressure.scenario.pressure)} mca`:'—',pressure?`${pressure.basin.meta.basin} · ${pressure.scenario.fire.tag}`:'');
  table.innerHTML=system.basins.map(basin=>{
    const summary=basinSummary(basin);
    return `<section class="global-basin-comparison">
      <div class="global-basin-title">
        <div><span>BACIA</span><h4>${basin.meta.basin||'Bacia sem identificação'}</h4></div>
        <small>${basin.tanks.length} tanque(s) · ${basin.meta.park||'Parque não informado'}</small>
      </div>
      ${scenarioComparisonTable(summary.scenarios)}
    </section>`;
  }).join('');
  const pending=[];
  Object.entries(system.isolationRules).forEach(([key,rule])=>{
    if(num(rule.required)>0&&num(rule.existing)<num(rule.required)){
      const [aId,bId]=key.split('|'),a=system.basins.find(b=>b.id===aId),b=system.basins.find(b=>b.id===bId);
      if(a&&b){
        const ordered=[a,b].sort((x,y)=>system.basins.indexOf(x)-system.basins.indexOf(y));
        pending.push(`${ordered[0].meta.basin} + ${ordered[1].meta.basin}`);
      }
    }
  });
  combined.innerHTML=pending.length
    ? `<div class="global-warning"><b>${pending.length} combinação(ões) necessária(s):</b> ${pending.join('; ')}.<br>Próximo dado técnico: indicar os tanques externos expostos em cada sentido. Depois o motor somará a espuma secundária aplicável e somente o resfriamento desses tanques.</div>`
    : '<div class="global-ok"><b>Nenhuma combinação simultânea confirmada.</b> Complete a matriz de isolamento ou mantenha as bacias isoladas conforme a regra aplicável.</div>';
}
function basinCalc(){
  const c=critical(), calculatedArea=num(state.basin.width)*num(state.basin.length),area=calculatedArea;
  const occupied=state.tanks.filter(t=>t.installation==='apoiado').reduce((s,t)=>s+projection(t),0);
  const usefulArea=Math.max(0,area-occupied), largest=Math.max(0,...state.tanks.map(t=>num(t.usefulVolume)));
  const bases=state.tanks.reduce((s,t)=>s+num(t.baseVolume),0);
  const combat=c.water?.totalVolume||0, required=largest+.5*combat+bases;
  const hydraulicHeight=usefulArea?required/usefulArea:0;
  const finalHeight=hydraulicHeight+num(state.basin.rain)+num(state.basin.freeboard);
  return {area,calculatedArea,occupied,usefulArea,largest,bases,combat,combatScenario:c.water,required,hydraulicHeight,finalHeight};
}
function bindStatic(){
  const map={studyName:['meta','name'],studyReference:['meta','reference'],responsible:['meta','responsible'],parkName:['meta','park'],basinName:['meta','basin'],basinType:['basin','type'],basinWidth:['basin','width'],basinLength:['basin','length'],precipitation:['basin','precipitation'],recurrenceTime:['basin','recurrenceTime'],rainHeight:['basin','rain'],freeboard:['basin','freeboard'],basinIsolation:['basin','isolation']};
  Object.entries(map).forEach(([id,path])=>{const el=$('#'+id);if(!el)return;const numeric=el.type==='number'||el.dataset.numeric==='true';el.value=state[path[0]][path[1]]??'';if(numeric)prepareNumericInput(el,value=>{state[path[0]][path[1]]=value;if(['width','length'].includes(path[1]))state.basin.basinFoamNormative=null;save();renderBasinFields();renderResults();if(['width','length'].includes(path[1]))analyzeBasinFoam()});else el.oninput=()=>{state[path[0]][path[1]]=el.value;save();renderBasinFields();renderResults()}})
}
function setCount(n){n=Math.max(1,Math.min(100,num(n)));while(state.tanks.length<n)state.tanks.push(tank({tag:`TQ${state.tanks.length+1}`}));state.tanks=state.tanks.slice(0,n);const ids=new Set(state.tanks.map(t=>t.id));state.distances=Object.fromEntries(Object.entries(state.distances||{}).filter(([k])=>k.split('|').every(id=>ids.has(id))));state.neighborAnalysis={};save();renderAll()}
function deleteTank(id){
  const target=state.tanks.find(t=>t.id===id);if(!target)return;
  if(state.tanks.length===1){alert('A bacia precisa manter pelo menos um tanque. Para remover toda a bacia, use Excluir no gerenciador de bacias.');return}
  if(!confirm(`Excluir o tanque ${target.tag||'selecionado'} da ${state.meta.basin||'bacia'}?\n\nAs distâncias, vínculos de vizinhança e cenários deste tanque também serão removidos.`))return;
  state.tanks=state.tanks.filter(t=>t.id!==id);
  state.neighborAnalysis={};
  state.distances=Object.fromEntries(Object.entries(state.distances||{}).filter(([key])=>!key.split('|').includes(id)));
  state.tanks.forEach(t=>{
    if(!t.coolingNeighborRates)return;
    delete t.coolingNeighborRates[id];
  });
  if(selectedScenario===id)selectedScenario=state.tanks[0]?.id||null;
  save();
  renderAll();
  renderBasinIsolation();
  renderGlobalConsolidation();
}
function field(t,k,type='number',cls='required',extra=''){
  const numeric=type==='number',integer=INTEGER_KEYS.has(k);
  const value=numeric?inputNumberValue(t[k],integer):String(t[k]??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return `<input class="${cls}" data-id="${t.id}" data-key="${k}" type="${numeric?'text':type}" ${numeric?`inputmode="${integer?'numeric':'decimal'}" data-numeric="true" data-integer="${integer}"`:''} value="${value}" ${extra}>`
}
function selectProductForTank(tankId,productId){
  const target=state.tanks.find(t=>t.id===tankId);if(!target)return;
  const product=productCatalog.find(p=>String(p.id)===String(productId));
  if(!product){
    Object.assign(target,{productId:null,product:'',productScientificName:'',productSource:'',flashPoint:null,boilingPoint:null,vaporPressure:null,vaporPressureConfirmed:false,liquidClass:'',miscibilityWater:'',foamGroup:'',classificationRuleVersion:'',storageTemperature:25,storageTemperatureAssumed:true,scenarioClass:'',thermalMessages:[],thermalRuleVersion:'',thermalPending:false,thermalError:''});
  }else{
    Object.assign(target,{
      productId:product.id,
      product:product.nome_comercial||'',
      productScientificName:product.nome_cientifico||'',
      productSource:product.fonte_referencia||'',
      flashPoint:product.ponto_fulgor,
      boilingPoint:product.ponto_ebulicao,
      vaporPressure:product.pressao_vapor,
      vaporPressureConfirmed:product.pressao_vapor_confirmada===true,
      liquidClass:product.classe_calculada||product.classe||'',
      miscibilityWater:product.miscibilidade_agua||'',
      foamGroup:product.grupo_espuma||'pendente',
      classificationRuleVersion:product.versao_regra_classificacao||'',
      storageTemperature:25,
      storageTemperatureAssumed:true,
      scenarioClass:product.classe_calculada||product.classe||'',
      thermalMessages:[],thermalRuleVersion:'',thermalPending:false,thermalError:''
    });
  }
  target.foamNormative=null;target.coolingNormative=null;state.basin.basinFoamNormative=null;save();renderAll();analyzeVerticalFoam(target);analyzeBasinFoam();analyzeAllCooling();
}
function renderTanks(){
  $('#tankCount').value=state.tanks.length;
  $('#tankTable').innerHTML=`<thead><tr><th>Tanque</th><th>Orientação</th><th>Instalação</th><th>Tipo de teto</th><th>Diâmetro (m)</th><th>Altura (m)</th><th>Comprimento (m)</th><th>Volume total calculado (m³)</th><th>Largura da coroa (m)</th><th>Inertizado</th><th>API 620 / sem solda fragilizada</th><th>Área de projeção</th><th>Área do costado</th><th>Ações</th></tr></thead><tbody>`+state.tanks.map(t=>{t.usefulVolume=tankTotalVolume(t);return `<tr>
  <td>${field(t,'tag','text')}</td>
  <td><select class="required" data-id="${t.id}" data-key="orientation"><option value="vertical" ${t.orientation==='vertical'?'selected':''}>Vertical</option><option value="horizontal" ${t.orientation==='horizontal'?'selected':''}>Horizontal</option></select></td>
  <td><select class="required" data-id="${t.id}" data-key="installation"><option value="apoiado" ${t.installation==='apoiado'?'selected':''}>Apoiado</option><option value="elevado" ${t.installation==='elevado'?'selected':''}>Elevado</option></select></td>
  <td><select class="required" data-id="${t.id}" data-key="roofType"><option value="fixo" ${t.roofType==='fixo'?'selected':''}>Fixo</option><option value="interno_flutuante" ${t.roofType==='interno_flutuante'?'selected':''}>Fixo com teto interno flutuante</option><option value="flutuante_externo" ${['flutuante','flutuante_externo'].includes(t.roofType)?'selected':''}>Flutuante externo</option></select></td>
  <td>${field(t,'diameter')}</td><td>${field(t,'height')}</td><td>${t.orientation==='horizontal'?field(t,'length'):'<span class="muted">Não se aplica</span>'}</td><td class="calc"><b>${fmt(t.usefulVolume)} m³</b></td>
  <td>${t.orientation==='vertical'&&t.roofType!=='fixo'?field(t,'sealWidth','number','required','placeholder="Ex.: 0,60"'):'<span class="muted">Não se aplica</span>'}</td>
  <td>${t.orientation==='vertical'?`<select class="required" data-id="${t.id}" data-key="inertized"><option value="false" ${t.inertized!==true&&t.inertized!=='true'?'selected':''}>Não</option><option value="true" ${t.inertized===true||t.inertized==='true'?'selected':''}>Sim</option></select>`:'<span class="muted">Não se aplica</span>'}</td>
  <td>${t.orientation==='vertical'?`<select class="required" data-id="${t.id}" data-key="api620"><option value="false" ${t.api620!==true&&t.api620!=='true'?'selected':''}>Não</option><option value="true" ${t.api620===true||t.api620==='true'?'selected':''}>Sim</option></select>`:'<span class="muted">Não se aplica</span>'}</td>
  <td class="calc">${fmt(projection(t))} m²</td><td class="calc">${fmt(shellArea(t))} m²</td>
  <td><button type="button" class="danger-action tank-delete" data-delete-tank="${t.id}" title="Excluir ${t.tag||'tanque'}">Excluir</button></td></tr>`}).join('')+'</tbody>';
  bindTableInputs($('#tankTable'));
  $$('[data-delete-tank]').forEach(el=>el.onclick=()=>deleteTank(el.dataset.deleteTank));
  $('#productTable').innerHTML=`<thead><tr><th>Tanque</th><th>Produto da Biblioteca Técnica</th><th>Fonte</th><th>PF (°C)</th><th>PE (°C)</th><th>PV (mmHg)</th><th>Classe original</th><th>Miscibilidade</th><th>Grupo para espuma</th><th>Temperatura considerada (°C)</th><th>Classe no cenário</th></tr></thead><tbody>`+state.tanks.map(t=>{
    const found=productCatalog.some(p=>String(p.id)===String(t.productId));
    const legacy=t.product&&!found?`<option value="${escapeText(t.productId||'legacy')}" selected>${escapeText(t.product)} — registro do estudo</option>`:'';
    const options=productCatalog.map(p=>`<option value="${p.id}" ${String(p.id)===String(t.productId)?'selected':''}>${escapeText(p.nome_comercial)}${p.classe?` — Classe ${escapeText(p.classe)}`:''}</option>`).join('');
    const temperature=t.storageTemperature===null||t.storageTemperature===undefined?'':inputNumberValue(t.storageTemperature);
    const thermal=normativeThermalAssessment(t);
    return `<tr><td><b>${escapeText(t.tag)}</b></td>
      <td><select class="required" data-product-tank="${t.id}"><option value="">Selecione</option>${legacy}${options}</select></td>
      <td class="calc" title="${escapeText(t.productSource)}">${escapeText(t.productSource)||'—'}</td>
      <td class="calc">${technicalValue(t.flashPoint)}</td>
      <td class="calc">${technicalValue(t.boilingPoint)}</td>
      <td class="calc">${technicalValue(t.vaporPressure)}</td>
      <td class="calc"><b>${escapeText(classify(t))}</b></td>
      <td class="calc">${escapeText(miscibilityLabel(t.miscibilityWater))}</td>
      <td class="calc">${escapeText(foamGroupLabel(t.foamGroup))}</td>
      <td>${t.productId?`<input class="required" type="text" inputmode="decimal" data-storage-temperature="${t.id}" value="${temperature}" title="Altere somente quando a temperatura considerada no cenário for diferente de 25 °C.">`:'<span class="muted">Selecione o produto</span>'}</td>
      <td class="calc" title="${escapeText(thermal.messages.join(' '))}"><b>${escapeText(thermal.adoptedClass||'—')}</b></td></tr>`
  }).join('')+'</tbody>';
  $$('[data-product-tank]').forEach(el=>el.onchange=()=>selectProductForTank(el.dataset.productTank,el.value));
  $$('[data-storage-temperature]').forEach(el=>prepareOptionalNumericInput(el,value=>{
    const target=state.tanks.find(t=>t.id===el.dataset.storageTemperature);if(!target)return;
    target.storageTemperature=value;target.storageTemperatureAssumed=false;
    target.scenarioClass='';target.thermalMessages=[];target.thermalRuleVersion='';target.thermalError='';
    save(false);renderTanks();renderResults();reclassifyTankTemperature(target);
  }));
  $('#baseTable').innerHTML=`<thead><tr><th>Tanque</th><th>Formato da base</th><th>Diâmetro (m)</th><th>Altura (m)</th><th>Volume calculado (m³)</th><th>Volume adotado (m³)</th></tr></thead><tbody>`+state.tanks.map(t=>{const calculated=Math.PI*num(t.baseDiameter)**2/4*num(t.baseHeight);return `<tr><td><b>${t.tag}</b></td><td><select class="required" data-id="${t.id}" data-key="baseShape"><option value="circular" ${t.baseShape==='circular'?'selected':''}>Circular</option><option value="outro" ${t.baseShape==='outro'?'selected':''}>Outro formato</option></select></td><td>${t.baseShape==='circular'?field(t,'baseDiameter'):'<span class="muted">Informe o volume</span>'}</td><td>${t.baseShape==='circular'?field(t,'baseHeight'):'<span class="muted">Não se aplica</span>'}</td><td class="calc">${t.baseShape==='circular'?fmt(calculated)+' m³':'—'}</td><td>${field(t,'baseVolume','number','required','data-base-volume')}</td></tr>`}).join('')+'</tbody>';
  bindTableInputs($('#baseTable'));
  $('#sameTankPrompt').hidden=state.tanks.length<2||!num(state.tanks[0]?.diameter);
  $('#sameProductPrompt').hidden=state.tanks.length<2||!state.tanks[0]?.product;
  $('#sameBasePrompt').hidden=state.tanks.length<2||(!num(state.tanks[0]?.baseDiameter)&&!num(state.tanks[0]?.baseVolume));
  renderFireSelect();renderBasinFields();
}
function bindTableInputs(root){root.querySelectorAll('[data-id]').forEach(el=>{
  const commit=value=>{const t=state.tanks.find(x=>x.id===el.dataset.id);t[el.dataset.key]=el.dataset.numeric==='true'?num(value):value;if(['diameter','height','length','orientation'].includes(el.dataset.key))t.usefulVolume=tankTotalVolume(t);if(el.dataset.key==='foamApplicationType')t.foamApplicationUserSelected=true;if(el.hasAttribute('data-base-volume'))t.baseVolumeManual=true;if(['baseDiameter','baseHeight'].includes(el.dataset.key)&&!t.baseVolumeManual)t.baseVolume=Math.PI*num(t.baseDiameter)**2/4*num(t.baseHeight);if(['diameter','orientation'].includes(el.dataset.key))state.neighborAnalysis={};if(['diameter','height','orientation','roofType','lgePercent','sealWidth','inertized','api620','foamApplicationType'].includes(el.dataset.key))t.foamNormative=null;if(['diameter','height','length','orientation','roofType'].includes(el.dataset.key))t.coolingNormative=null;if(['diameter','height','length','orientation'].includes(el.dataset.key))state.basin.basinFoamNormative=null;save();renderAll();if(['diameter','height','orientation','roofType','lgePercent','sealWidth','inertized','api620','foamApplicationType'].includes(el.dataset.key))analyzeVerticalFoam(t);if(['diameter','height','length','orientation','roofType'].includes(el.dataset.key))analyzeAllCooling();if(['diameter','height','length','orientation'].includes(el.dataset.key))analyzeBasinFoam()};
  if(el.dataset.numeric==='true')prepareNumericInput(el,commit);else el.onchange=()=>commit(el.value);
})}
function renderBasinFields(){
  const area=$('#basinAreaOutput');if(!area)return;
  area.textContent=`${fmt(num(state.basin.width)*num(state.basin.length))} m²`;
  $('#basinIsolationField').hidden=state.basin.type!=='isolated';
}
function renderFireSelect(){const old=$('#fireTank').value;$('#fireTank').innerHTML=state.tanks.map(t=>`<option value="${t.id}">${t.tag}</option>`).join('');$('#fireTank').value=state.tanks.some(t=>t.id===old)?old:state.tanks[0]?.id||''}
function renderDistanceInputMatrix(){
  $('#distanceInputMatrix').innerHTML='<thead><tr><th>De / Para</th>'+state.tanks.map(t=>`<th>${t.tag}</th>`).join('')+'</tr></thead><tbody>'+state.tanks.map((a,i)=>`<tr><th>${a.tag}</th>${state.tanks.map((b,j)=>{
    if(i===j)return '<td class="muted distance-diagonal">—</td>';
    const key=pairKey(a,b),value=state.distances?.[key];
    if(j<i)return `<td class="calc distance-mirror">${value===undefined?'—':fmt(value)} m</td>`;
    return `<td><input class="required distance-input" type="text" inputmode="decimal" data-numeric="true" data-distance-key="${key}" value="${inputNumberValue(value)}" placeholder="0,00 m"></td>`;
  }).join('')}</tr>`).join('')+'</tbody>';
  $$('[data-distance-key]').forEach(el=>prepareNumericInput(el,value=>{state.distances[el.dataset.distanceKey]=value;state.neighborAnalysis={};state.tanks.forEach(t=>t.coolingNormative=null);save(false);renderDistances();renderResults();validate();analyzeAllNeighbors()}));
}
function renderDistances(){
  const fire=state.tanks.find(t=>t.id===$('#fireTank').value)||state.tanks[0];if(!fire)return;
  renderDistanceInputMatrix();
  const ns=neighbors(fire);
  $('#neighborSummary').textContent=fire.orientation==='horizontal'?'Cenário de bacia — sem análise de vizinhos':`${ns.length} vizinho(s) de ${Math.max(0,state.tanks.length-1)}`;
  $('#distanceTable').innerHTML='<thead><tr><th>Tanque analisado</th><th>Distância informada</th><th>Referência calculada</th><th>Limite adotado</th><th>Resultado</th><th>Justificativa</th></tr></thead><tbody>'+state.tanks.filter(t=>t.id!==fire.id).map(t=>{const key=pairKey(fire,t),has=state.distances?.[key]!==undefined,item=state.neighborAnalysis?.[fire.id]?.[t.id],basin=item?.resultado==='cenario_bacia'||fire.orientation==='horizontal',yes=item?.resultado==='vizinho',pending=!basin&&(!item||item.resultado==='pendente');return `<tr><td>${t.tag}</td><td>${basin?'Não se aplica':has?fmt(shellDistance(fire,t))+' m':'Não informado'}</td><td>${item?.referencia_calculada_m===null||item?.referencia_calculada_m===undefined?'—':fmt(item.referencia_calculada_m)+' m'}</td><td>${item?.limite_adotado_m===null||item?.limite_adotado_m===undefined?'—':`<b>${fmt(item.limite_adotado_m)} m</b>`}</td><td class="${basin||yes?'ok':pending?'muted':'bad'}">${basin?'CENÁRIO DE BACIA':pending?'PENDENTE':yes?'SIM':'NÃO'}</td><td>${escapeText(item?.justificativa||(basin?'Regra SAR: espuma em toda a bacia, sem resfriamento.':!has?'Informe a distância para executar a análise.':'Análise aguardando o motor normativo.'))}</td></tr>`}).join('')+'</tbody>';
  $('#matrixTable').innerHTML='<thead><tr><th>Em chamas ↓ / Analisado →</th>'+state.tanks.map(t=>`<th>${t.tag}</th>`).join('')+'<th>Total</th></tr></thead><tbody>'+state.tanks.map(f=>`<tr><th>${f.tag}</th>${state.tanks.map(t=>{const basin=f.orientation==='horizontal'&&f.id!==t.id,item=state.neighborAnalysis?.[f.id]?.[t.id],pending=f.id!==t.id&&!basin&&(!item||item.resultado==='pendente');return `<td class="${f.id===t.id||pending?'muted':basin||neighbor(f,t)?'ok':'bad'}">${f.id===t.id?'—':basin?'BACIA':pending?'PENDENTE':neighbor(f,t)?'SIM':'NÃO'}</td>`}).join('')}<td><b>${f.orientation==='horizontal'?'Bacia':neighbors(f).length}</b></td></tr>`).join('')+'</tbody>';
}
function renderProtection(){
  const table=$('#primaryFoamTable');if(!table)return;
  table.innerHTML=`<thead><tr>
    <th>Tanque</th><th>Diâmetro (m)</th><th>Altura (m)</th><th>Volume total (m³)</th><th>Produto / classe</th><th>Sistema mínimo normativo</th><th>Tipo de aplicação adotado</th><th>Dosagem LGE (%)</th>
  </tr></thead><tbody>`+state.tanks.map(t=>{const n=t.foamNormative,isExempt=n?.dimensionado&&!n.exigido;return `<tr>
    <td><b>${t.tag}</b></td><td>${fmt(t.diameter)}</td><td>${fmt(t.height)}</td><td>${fmt(t.usefulVolume)}</td>
    <td>${escapeText(t.product||'—')}<small class="cell-hint"><b>Classe ${escapeText(classify(t))}</b></small></td>
    <td><b>${t.foamPending?'Calculando...':isExempt?'Isento':foamMethodLabel(n?.tipo_aplicacao_minimo)}</b></td>
    <td>${isExempt?'<b>Isento</b>':`<select class="normative" data-id="${t.id}" data-key="foamApplicationType" ${t.foamPending?'disabled':''}>${foamMethodOptions(t)}</select><small class="cell-hint">Somente opção equivalente ou superior</small>`}</td>
    <td>${isExempt?'—':field(t,'lgePercent','number','normative')}</td>
  </tr>`}).join('')+'</tbody>';
  bindTableInputs(table);
  const rows=state.tanks.map(t=>({tank:t,...primaryFoam(t)}));
  const details=$('#foamPrimaryDetails');
  if(details)details.innerHTML=state.tanks.map((t,index)=>{const f=primaryFoam(t),n=t.foamNormative,isExempt=n?.dimensionado&&!n.exigido,status=t.foamError?`Falha: ${t.foamError}`:n?.motivo||'Aguardando motor normativo';return `<details class="step-card foam-scenario" ${index===0?'open':''}>
    <summary><span>${index+1}</span><div><b>Resultado — ${t.tag}</b><small>${escapeText(t.product||'Produto não informado')} · Classe ${escapeText(classify(t))} · ${isExempt?'Isento':foamMethodLabel(t.foamApplicationType)}</small></div></summary>
    <div class="step-body">${isExempt?`<div class="callout"><b>Isento de espuma:</b> ${escapeText(status)}</div>`:`<div class="table-wrap"><table><thead><tr><th>Área</th><th>Taxa normativa</th><th>Vento</th><th>Taxa adotada</th><th>Tempo</th><th>Vazão</th><th>LGE combate</th><th>LGE reserva</th><th>LGE total</th></tr></thead><tbody><tr><td>${fmt(f.area)} m²</td><td>${fmt(f.rate)} L/min/m²</td><td>${f.wind?fmt(f.wind,0)+'%':'—'}</td><td>${fmt(f.majoratedRate)} L/min/m²</td><td>${fmt(t.foamTime,0)} min</td><td><b>${fmt(f.solutionFlow)} L/min</b></td><td>${fmt(f.combatLge)} L</td><td>${fmt(f.reserveLge)} L</td><td><b>${fmt(f.totalLge)} L</b></td></tr></tbody></table></div><p class="cooling-area-note"><b>Dados:</b> diâmetro ${fmt(t.diameter)} m · altura ${fmt(t.height)} m · volume ${fmt(t.usefulVolume)} m³ · produto ${escapeText(t.product||'—')} · Classe ${escapeText(classify(t))}.</p>`}</div>
  </details>`}).join('');
  const maxFlow=rows.reduce((a,b)=>!a||b.solutionFlow>a.solutionFlow?b:a,null);
  const maxLge=rows.reduce((a,b)=>!a||b.totalLge>a.totalLge?b:a,null);
  $('#foamPrimaryMetrics').innerHTML=metric('Maior vazão de solução',`${fmt(maxFlow?.solutionFlow)} L/min`,maxFlow?.tank.tag||'—')+
    metric('Maior LGE de combate',`${fmt(Math.max(0,...rows.map(x=>x.combatLge)))} litros`)+
    metric('Maior LGE total',`${fmt(maxLge?.totalLge)} litros`,maxLge?.tank.tag||'—')+
    metric('Tanques dimensionados',`${rows.length}`,'espuma primária');
  $('#samePrimaryFoamPrompt').hidden=true;
  renderSecondaryFoam();
}
function renderSecondaryFoam(){
  const table=$('#secondaryFoamTable');if(!table)return;
  table.innerHTML=`<thead><tr>
    <th>Referência</th><th>Diâmetro do maior tanque<br><small>(m)</small></th>
    <th>Quantidade de linhas<br><small>Tabela 3.9</small></th>
    <th>Vazão por linha<br><small>(L/min)</small></th><th>Vazão secundária total<br><small>(L/min)</small></th>
    <th>Tempo de aplicação<br><small>Tabela 3.10 (min)</small></th><th>Volume de solução<br><small>(litros)</small></th>
    <th>Dosagem LGE<br><small>(%)</small></th><th>Quantidade LGE combate<br><small>(litros)</small></th>
    <th>Quantidade LGE reserva<br><small>(litros)</small></th><th>Quantidade LGE total<br><small>(litros)</small></th>
  </tr></thead><tbody>`;
  const f=secondaryFoam();
  table.innerHTML+=`<tr>
    <td><b>${state.meta.basin||'Bacia'}</b></td>
    <td class="calc">${fmt(f.largestDiameter)}</td>
    <td class="calc"><b>${f.lineCount}</b></td>
    <td class="calc">${fmt(f.flowPerLine)}</td>
    <td class="calc"><b>${fmt(f.solutionFlow)}</b></td>
    <td class="calc"><b>${fmt(f.duration,0)}</b></td>
    <td class="calc"><b>${fmt(f.solutionVolume)}</b></td>
    <td><input class="normative" data-basin-foam="secondaryLgePercent" data-numeric="true" type="text" inputmode="decimal" value="${inputNumberValue(state.basin.secondaryLgePercent)}"></td>
    <td class="calc">${fmt(f.combatLge)}</td><td class="calc">${fmt(f.reserveLge)}</td>
    <td class="calc"><b>${fmt(f.totalLge)}</b></td>
  </tr></tbody>`;
  table.querySelectorAll('[data-basin-foam]').forEach(el=>{
    const commit=value=>{state.basin[el.dataset.basinFoam]=num(value);save();renderProtection();renderResults()};
    if(el.dataset.numeric==='true')prepareNumericInput(el,commit);else el.onchange=()=>commit(el.value);
  });
  $('#foamSecondaryMetrics').innerHTML=metric('Maior diâmetro',`${fmt(f.largestDiameter)} m`,'base das Tabelas 3.9 e 3.10')+
    metric('Vazão secundária',`${fmt(f.solutionFlow)} L/min`,`${f.lineCount} × 200 L/min`)+
    metric('Linhas necessárias',`${f.lineCount}`,`${fmt(f.flowPerLine)} L/min por linha`)+
    metric('Volume da solução',`${fmt(f.solutionVolume)} litros`,`${f.duration} min de aplicação`)+
    metric('LGE total',`${fmt(f.totalLge)} litros`,'combate × 2');
  const basinTable=$('#basinFoamTable'),bf=basinFoam(),n=state.basin.basinFoamNormative;
  if(basinTable){
    basinTable.innerHTML=`<thead><tr><th>Bacia</th><th>Área útil de aplicação (m²)</th><th>Tipo de aplicação</th><th>Produto governante / classe</th><th>Taxa normativa</th><th>Majoração</th><th>Taxa adotada</th><th>Tempo</th><th>Vazão</th><th>Volume solução</th><th>LGE total</th></tr></thead><tbody><tr>
      <td><b>${escapeText(state.meta.basin||'Bacia')}</b></td><td>${fmt(basinCalc().usefulArea)}</td>
      <td><select class="normative" data-basin-foam-method ${state.basin.basinFoamPending?'disabled':''}><option value="camera" ${state.basin.basinFoamMethod==='camera'?'selected':''}>Câmara/aplicadores fixos</option><option value="monitor" ${state.basin.basinFoamMethod==='monitor'?'selected':''}>Canhões-monitores/linhas manuais</option></select><small class="cell-hint">${state.basin.basinFoamPending?'Calculando...':'Seleção do projetista'}</small></td>
      <td>${bf.required?`${escapeText(bf.product||'—')}<small class="cell-hint">Classe ${escapeText(bf.className||'—')}</small>`:escapeText(n?.motivo||state.basin.basinFoamError||'Aguardando cálculo')}</td>
      <td>${bf.required?fmt(bf.rate)+' L/min/m²':'—'}</td><td>${bf.required&&bf.wind?fmt(bf.wind,0)+'%':'—'}</td><td>${bf.required?fmt(bf.adoptedRate)+' L/min/m²':'—'}</td><td>${bf.required?fmt(bf.duration,0)+' min':'—'}</td><td><b>${bf.required?fmt(bf.solutionFlow)+' L/min':'—'}</b></td><td>${bf.required?fmt(bf.solutionVolume)+' L':'—'}</td><td><b>${bf.required?fmt(bf.totalLge)+' L':'—'}</b></td>
    </tr></tbody>`;
    basinTable.querySelector('[data-basin-foam-method]')?.addEventListener('change',e=>{state.basin.basinFoamMethod=e.target.value;state.basin.basinFoamNormative=null;save();renderSecondaryFoam();analyzeBasinFoam()});
  }
  if($('#basinFoamMetrics'))$('#basinFoamMetrics').innerHTML=metric('Área útil da bacia',`${fmt(basinCalc().usefulArea)} m²`,'área interna menos projeções')+metric('Vazão da aplicação',`${fmt(bf.solutionFlow)} L/min`,bf.required?foamMethodLabel(state.basin.basinFoamMethod):'Isento')+metric('Tempo',`${fmt(bf.duration,0)} min`,bf.reference||'Tabelas 3.6 e 3.7')+metric('Volume da solução',`${fmt(bf.solutionVolume)} litros`)+metric('LGE total',`${fmt(bf.totalLge)} litros`,'combate × 2');
}
function metric(label,value,sub=''){return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`}
function renderResults(){
  const c=critical();if(!c.ss.length)return;
  if($('#criticalMetrics'))$('#criticalMetrics').innerHTML=metric('Reserva crítica',`${fmt(c.water.totalVolume)} m³`,c.water.fire.tag)+metric('Vazão crítica',`${fmt(c.flow.totalFlow)} L/min`,c.flow.fire.tag)+metric('Pressão crítica',`${fmt(c.pressure.pressure)} mca`,c.pressure.fire.tag)+metric('Reserva crítica de LGE',`${fmt(c.lge.lgeVolume)} m³`,c.lge.fire.tag);
  if($('#scenarioTable')){
    $('#scenarioTable').innerHTML='<thead><tr><th>Em chamas</th><th>Vizinhos</th><th>Volume útil do risco</th><th>Resf. próprio</th><th>Resf. vizinhos</th><th>Espuma tanque</th><th>Linhas espuma</th><th>Vazão total</th><th>Volume total</th><th>LGE</th><th></th></tr></thead><tbody>'+c.ss.map(s=>`<tr><td><b>${s.fire.tag}</b></td><td>${s.basinFire?'Bacia inteira':s.ns.map(x=>x.tag).join(', ')||'Nenhum'}</td><td>${fmt(s.totalRiskVolume)} m³</td><td>${s.basinFire?'Não se aplica':fmt(s.ownCooling)+' L/min'}</td><td>${s.basinFire?'Não se aplica':fmt(s.neighborCooling)+' L/min'}</td><td>${s.basinFire?'Motor de espuma':fmt(s.foamMain)+' L/min'}</td><td>${s.basinFire?'Motor de espuma':fmt(s.foamLines)+' L/min'}</td><td>${s.basinFire?'Pendente':fmt(s.totalFlow)+' L/min'}</td><td>${s.basinFire?'Pendente':fmt(s.totalVolume)+' m³'}</td><td>${s.basinFire?'Pendente':fmt(s.lgeVolume)+' m³'}</td><td><button data-detail="${s.fire.id}">Ver</button></td></tr>`).join('')+'</tbody>';
    $$('[data-detail]').forEach(b=>b.onclick=()=>{selectedScenario=b.dataset.detail;renderScenarioDetail()});
  }
  if(!selectedScenario)selectedScenario=c.ss[0]?.fire.id;renderScenarioDetail();renderCombinedScenarios();renderBasin();
}
function renderScenarioDetail(){
  const host=$('#coolingScenarios');if(!host)return;
  const requirements=$('#coolingRequirements');
  if(requirements)requirements.innerHTML=`<thead><tr><th>Tanque</th><th>Altura (m)</th><th>Diâmetro (m)</th><th>Volume total (m³)</th><th>Produto / classe</th><th>Sistema mínimo normativo</th><th>Sistema adotado</th></tr></thead><tbody>${state.tanks.map(t=>`<tr><td><b>${t.tag}</b></td><td>${fmt(t.height)}</td><td>${fmt(t.diameter)}</td><td><b>${fmt(t.usefulVolume)}</b></td><td>${escapeText(t.product||'—')}<small class="cell-hint"><b>Classe ${escapeText(classify(t))}</b></small></td><td>${t.orientation==='horizontal'?'Cenário de bacia — sem resfriamento':t.coolingNormative?.isento?'Isento':coolingMinimumLabel(t.coolingNormative?.sistema_minimo)}</td><td>${t.orientation==='horizontal'||t.coolingNormative?.isento?'—':`<select class="normative" data-cooling-id="${t.id}" data-cooling-key="coolingMethod" aria-label="Sistema de resfriamento adotado para ${escapeText(t.tag)}" ${t.coolingPending?'disabled':''}>${coolingMethodOptions(t)}</select><small class="cell-hint">${t.coolingPending?'Recalculando taxas e vazões...':'Somente opção equivalente ou superior'}</small>`}</td></tr>`).join('')}</tbody>`;
  host.innerHTML=scenarios().map((s,index)=>{
    const fire=s.fire,others=state.tanks.filter(t=>t.id!==fire.id),time=num(fire.coolingTime);
    if(s.basinFire)return `<details class="step-card cooling-scenario" ${index===0?'open':''}>
      <summary><span>${index+1}</span><div><b>Cenário — ${fire.tag} horizontal em chamas</b><small>Espuma em toda a bacia · sem resfriamento</small></div></summary>
      <div class="step-body"><div class="callout warning"><b>Regra SAR — cenário de bacia:</b> aplicar espuma em toda a bacia de contenção. Não prever resfriamento do tanque em chamas nem dos demais tanques. O dimensionamento de vazão, tempo, RTI e LGE será concluído pelo motor de espuma da bacia.</div></div>
    </details>`;
    if(fire.coolingNormative?.isento)return `<details class="step-card cooling-scenario" ${index===0?'open':''}>
      <summary><span>${index+1}</span><div><b>Cenário — ${fire.tag} em chamas</b><small>Isento de resfriamento</small></div></summary>
      <div class="step-body"><div class="callout"><b>Resultado do motor normativo:</b> ${escapeText(fire.coolingNormative.motivo||'Cenário isento conforme Tabela 3.1.')} Vazão e reserva de resfriamento iguais a zero.</div></div>
    </details>`;
    const roofRule='somente costado';
    const reservoir=s.coolingFlow*time/1000;
    const cooling=fire.coolingNormative,details=Object.fromEntries((cooling?.vizinhos||[]).map(item=>[item.tanque_id,item]));
    return `<details class="step-card cooling-scenario" ${index===0?'open':''}>
      <summary><span>${index+1}</span><div><b>Cenário — ${fire.tag} em chamas</b><small>${fire.coolingPending?'Calculando no motor...':fire.coolingError?`Falha: ${escapeText(fire.coolingError)}`:`${s.ns.length} tanque(s) vizinho(s) considerado(s)`}</small></div></summary>
      <div class="step-body">
        <p class="cooling-area-note"><b>Sistema adotado: ${coolingMethodLabel(fire.coolingMethod)}.</b> Cenário apresentado somente para consulta. ${fire.tag} em chamas recebe resfriamento somente no costado. Nos tanques vizinhos, teto fixo recebe teto + costado e teto flutuante recebe somente costado.</p>
        <div class="cooling-layout">
          <div class="table-wrap cooling-table-wrap"><table class="cooling-table"><thead><tr><th>Parâmetro</th><th>${fire.tag} em chamas</th>${others.map(t=>`<th>${t.tag}</th>`).join('')}</tr></thead><tbody>
            <tr><th>Distância ao tanque em chamas (m)</th><td class="muted">—</td>${others.map(t=>`<td>${state.distances?.[pairKey(fire,t)]===undefined?'<span class="bad">Não informada</span>':fmt(shellDistance(fire,t))}</td>`).join('')}</tr>
            <tr><th>Sistema adotado</th><td>${coolingMethodLabel(fire.coolingMethod)}</td>${others.map(t=>`<td>${details[t.id]?coolingMethodLabel(details[t.id].metodo_adotado):'—'}</td>`).join('')}</tr>
            <tr><th>Tipo de teto</th><td>${fire.roofType}</td>${others.map(t=>`<td>${t.roofType}</td>`).join('')}</tr>
            <tr><th>Área de aplicação (m²)</th><td>${fmt(cooling?.tanque_em_chamas?.area_m2??fireCoolingArea(fire))}<small class="cell-hint">${roofRule}</small></td>${others.map(t=>`<td>${details[t.id]?`${fmt(details[t.id].area_aplicacao_m2)}<small class="cell-hint">${escapeText(details[t.id].criterio_area)}</small>`:'—'}</td>`).join('')}</tr>
            <tr><th>Taxa de aplicação (L/min/m²)</th><td>${fmt(cooling?.tanque_em_chamas?.taxa_lpm_m2??fire.coolingOwnRate)}</td>${others.map(t=>`<td>${details[t.id]?fmt(details[t.id].taxa_lpm_m2):'—'}</td>`).join('')}</tr>
            <tr><th>Vazão de resfriamento (L/min)</th><td>${fmt(s.ownCooling)}</td>${others.map(t=>`<td>${details[t.id]?fmt(details[t.id].vazao_lpm):'—'}</td>`).join('')}</tr>
            <tr><th>Volume armazenado (m³)</th><td>${fmt(fire.usefulVolume)}</td>${others.map(t=>`<td>${fmt(t.usefulVolume)}</td>`).join('')}</tr>
            <tr class="cooling-neighbor-row"><th>Considerado vizinho?</th><td class="fire-soft">EM CHAMAS</td>${others.map(t=>`<td class="${neighbor(fire,t)?'ok':'bad'}">${state.distances?.[pairKey(fire,t)]===undefined?'PENDENTE':neighbor(fire,t)?'SIM':'NÃO'}</td>`).join('')}</tr>
          </tbody></table></div>
          <aside class="cooling-summary"><div class="cooling-summary-title">Resumo — ${fire.tag}</div>
            <div class="summary-row"><span>Vazão combate TQ em chamas</span><b>${fmt(s.ownCooling)} L/min</b></div>
            <div class="summary-row"><span>Vazão combate TQ vizinhos</span><b>${fmt(s.neighborCooling)} L/min</b></div>
            <div class="summary-row total"><span>Vazão total</span><b>${fmt(s.coolingFlow)} L/min</b></div>
            <div class="summary-row"><span>Tanque em chamas</span><b>${fmt(fire.usefulVolume)} m³</b></div>
            <div class="summary-row"><span>Armazenamento dos vizinhos</span><b>${fmt(s.neighborStorage)} m³</b></div>
            <div class="summary-row total"><span>Armazenamento do cenário</span><b>${fmt(s.totalRiskVolume)} m³</b></div>
            <div class="summary-row"><span>Tempo de aplicação</span><b>${fmt(time,0)} min</b></div>
            <div class="summary-row reservoir"><span>Reserva mínima</span><b>${fmt(reservoir)} m³</b></div>
          </aside>
        </div>
      </div>
    </details>`;
  }).join('')||'<div class="callout warning">Cadastre pelo menos um tanque para gerar os cenários.</div>';
  $$('[data-cooling-id]').forEach(el=>{
    const commit=value=>{
    const fire=state.tanks.find(t=>t.id===el.dataset.coolingId);if(!fire)return;
    fire[el.dataset.coolingKey]=el.tagName==='SELECT'?value:num(value);
    if(el.dataset.coolingKey==='coolingMethod')fire.coolingMethodUserSelected=true;
    save();renderScenarioDetail();renderResults();analyzeAllCooling();
    };
    if(el.dataset.numeric==='true')prepareNumericInput(el,commit);else el.onchange=()=>commit(el.value);
  });
  $$('[data-cooling-neighbor-fire]').forEach(el=>prepareNumericInput(el,value=>{
    const fire=state.tanks.find(t=>t.id===el.dataset.coolingNeighborFire);if(!fire)return;
    fire.coolingNeighborRates={...(fire.coolingNeighborRates||{}),[el.dataset.coolingNeighborTank]:num(value)};
    save();renderScenarioDetail();renderResults();
  }));
  applySequentialTabOrder();
}
function renderCombinedScenarios(){
  const host=$('#combinedScenarios');if(!host)return;
  const ss=scenarios();
  if(!ss.length){
    host.innerHTML='<div class="callout warning">Cadastre pelo menos um tanque para gerar os cenários.</div>';
    return;
  }
  const details=`<div class="table-wrap scenario-sheet-wrap"><table class="scenario-sheet">
    <thead><tr>
      <th>Cenário</th>
      <th>Componente</th>
      <th>Área de aplicação</th>
      <th>Taxa</th>
      <th>Tempo</th>
      <th>Vazão</th>
      <th>RTI (m³)</th>
      <th>Volume de espuma / LGE (L)</th>
    </tr></thead>
    <tbody>${ss.map((s,index)=>{
    const fire=s.fire;
    const neighborsLabel=s.ns.map(t=>t.tag).join(', ')||'Nenhum';
    if(s.basinFire){const bf=s.basinApplication;return `
      <tr class="scenario-group-title"><td colspan="8"><span>${index+1}</span><b>Cenário — ${fire.tag} horizontal em chamas</b><small>Regra SAR: bacia inteira, sem resfriamento</small></td></tr>
      <tr><td class="scenario-fire-cell"><b>${fire.tag}</b><small>em chamas</small></td><td><b>Espuma em toda a bacia</b><small class="cell-hint">${foamMethodLabel(state.basin.basinFoamMethod)}</small></td><td>${fmt(bf.area)} m²</td><td>${fmt(bf.adoptedRate)} L/min/m²</td><td>${fmt(bf.duration,0)} min</td><td>${fmt(bf.solutionFlow)} L/min</td><td>${fmt(bf.solutionVolume/1000)} m³</td><td>${fmt(bf.totalLge)} L</td></tr>
      <tr><td colspan="2"><b>Resfriamento</b></td><td colspan="6">Não se aplica — vazão e reserva de resfriamento iguais a zero.</td></tr>
      <tr class="scenario-total-row"><td colspan="5"><b>Total do cenário — ${fire.tag}</b></td><td><b>${fmt(s.totalFlow)} L/min</b></td><td><b>${fmt(s.totalVolume)} m³</b></td><td><b>${fmt(bf.totalLge)} L</b></td></tr>`;}
    return `
      <tr class="scenario-group-title">
        <td colspan="8"><span>${index+1}</span><b>Cenário — ${fire.tag} em chamas</b><small>Tanques vizinhos: ${neighborsLabel}</small></td>
      </tr>
      <tr>
        <td rowspan="4" class="scenario-fire-cell"><b>${fire.tag}</b><small>em chamas</small></td>
        <td><b>Espuma primária — ${fire.tag}</b></td>
        <td>${fmt(s.primary.area)} m²</td>
        <td>${fmt(s.primary.majoratedRate)} L/min/m²</td>
        <td>${fmt(fire.foamTime,0)} min</td>
        <td>${fmt(s.foamMain)} L/min</td>
        <td>${fmt(s.foamMain*num(fire.foamTime)/1000)} m³</td>
        <td>${fmt(s.primary.totalLge)} L</td>
      </tr>
      <tr>
        <td><b>Espuma secundária — ${state.meta.basin||'bacia'}</b><small class="cell-hint">${s.secondary.lineCount} linha(s)</small></td>
        <td>—</td>
        <td>${fmt(s.secondary.flowPerLine)} L/min por linha</td>
        <td>${fmt(s.secondary.duration,0)} min</td>
        <td>${fmt(s.foamLines)} L/min</td>
        <td>${fmt(s.secondary.solutionVolume/1000)} m³</td>
        <td>${fmt(s.secondary.totalLge)} L</td>
      </tr>
      <tr>
        <td><b>Resfriamento — tanque em chamas</b><small class="cell-hint">somente costado</small></td>
        <td>${fmt(fireCoolingArea(fire))} m²</td>
        <td>${fmt(fire.coolingOwnRate)} L/min/m²</td>
        <td>${fmt(fire.coolingTime,0)} min</td>
        <td>${fmt(s.ownCooling)} L/min</td>
        <td>${fmt(s.ownCooling*num(fire.coolingTime)/1000)} m³</td><td>—</td>
      </tr>
      <tr>
        <td><b>Resfriamento — tanques vizinhos</b><small class="cell-hint">${neighborsLabel}</small></td>
        <td>${fmt(s.ns.reduce((a,t)=>a+neighborCoolingArea(t),0))} m²</td>
        <td>Variável por tanque</td>
        <td>${fmt(fire.coolingTime,0)} min</td>
        <td>${fmt(s.neighborCooling)} L/min</td>
        <td>${fmt(s.neighborCooling*num(fire.coolingTime)/1000)} m³</td><td>—</td>
      </tr>
      <tr class="scenario-total-row">
        <td colspan="5"><b>Total do cenário — ${fire.tag}</b></td>
        <td><span>Vazão total</span><b>${fmt(s.totalFlow)} L/min</b></td>
        <td><span>RTI total</span><b>${fmt(s.totalVolume)} m³</b></td>
        <td><span>Volume de espuma total</span><b>${fmt(s.primary.totalLge+s.secondary.totalLge)} L</b></td>
      </tr>`;
  }).join('')}</tbody></table></div>`;
  const summary=`<div class="card-heading scenario-comparison-heading">
    <div><span class="eyebrow">RESUMO GERAL</span><h3>Comparativo dos cenários</h3><p>Uma linha para cada hipótese de tanque em chamas.</p></div>
  </div>
  ${scenarioComparisonTable(ss)}`;
  host.innerHTML=summary+details;
  renderScenarioReview();
}
function scenarioComparisonTable(ss){
  return `<div class="table-wrap scenario-comparison-wrap"><table class="scenario-comparison-table">
    <thead><tr>
      <th>Cenário</th>
      <th>Vazão TQ em chamas</th>
      <th>Vazão TQ vizinhos</th>
      <th>Vazão espuma primária</th>
      <th>Vazão espuma secundária</th>
      <th>Vazão total</th>
      <th>Volume espuma primária (L)</th>
      <th>Volume espuma secundária (L)</th>
      <th>Volume espuma total (L)</th>
      <th>RTI total</th>
    </tr></thead>
    <tbody>${ss.map((s,index)=>{
      if(s.basinFire)return `<tr><td><span class="scenario-number">${index+1}</span><b>${s.fire.tag} horizontal em chamas</b></td><td colspan="2">Não se aplica</td><td>${fmt(s.foamMain)} L/min</td><td>—</td><td class="scenario-highlight"><b>${fmt(s.totalFlow)} L/min</b></td><td>${fmt(s.basinApplication.totalLge)} L</td><td>—</td><td class="scenario-highlight"><b>${fmt(s.basinApplication.totalLge)} L</b></td><td class="scenario-highlight"><b>${fmt(s.totalVolume)} m³</b></td></tr>`;
      const primaryFoamVolumeL=s.primary.totalLge;
      const secondaryFoamVolumeL=s.secondary.totalLge;
      const totalFoamVolumeL=primaryFoamVolumeL+secondaryFoamVolumeL;
      return `<tr>
      <td><span class="scenario-number">${index+1}</span><b>${s.fire.tag} em chamas</b></td>
      <td>${fmt(s.ownCooling)} L/min</td>
      <td>${fmt(s.neighborCooling)} L/min</td>
      <td>${fmt(s.foamMain)} L/min</td>
      <td>${fmt(s.foamLines)} L/min</td>
      <td class="scenario-highlight"><b>${fmt(s.ownCooling+s.neighborCooling+s.foamMain+s.foamLines)} L/min</b></td>
      <td>${fmt(primaryFoamVolumeL)} L</td>
      <td>${fmt(secondaryFoamVolumeL)} L</td>
      <td class="scenario-highlight"><b>${fmt(totalFoamVolumeL)} L</b></td>
      <td class="scenario-highlight"><b>${fmt(s.totalVolume)} m³</b></td>
    </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
function renderBasin(){
  const b=basinCalc(),s=b.combatScenario;
  $('#basinMetrics').innerHTML=metric('Área interna',`${fmt(b.area)} m²`)+metric('Área útil efetiva',`${fmt(b.usefulArea)} m²`,`desconto: ${fmt(b.occupied)} m²`)+metric('Volume geométrico exigido',`${fmt(b.required)} m³`)+metric('Altura mínima do dique',`${fmt(b.finalHeight)} m`,'valor mínimo calculado');
  $('#basinMemory').innerHTML=`<h3>Memória de cálculo completa da bacia</h3>
    <p><b>1. Área interna:</b> ${fmt(state.basin.width)} m × ${fmt(state.basin.length)} m = <b>${fmt(b.area)} m²</b>.</p>
    <p><b>2. Área ocupada pelos tanques apoiados:</b> Σ áreas de projeção = <b>${fmt(b.occupied)} m²</b>.</p>
    <p><b>3. Área útil efetiva:</b> ${fmt(b.area)} − ${fmt(b.occupied)} = <b>${fmt(b.usefulArea)} m²</b>.</p>
    <p><b>4. Maior volume de tanque:</b> <b>${fmt(b.largest)} m³</b>.</p>
    <p><b>5. Cenário de combate governante:</b> ${escapeText(s?.fire?.tag||'—')} em chamas.</p>
    <p>Resfriamento do tanque em chamas: <b>${fmt(s?.ownCooling)} L/min</b> × ${fmt(s?.fire?.coolingTime,0)} min = <b>${fmt(num(s?.ownCooling)*num(s?.fire?.coolingTime)/1000)} m³</b>.</p>
    <p>Resfriamento dos vizinhos: <b>${fmt(s?.neighborCooling)} L/min</b> × ${fmt(s?.fire?.coolingTime,0)} min = <b>${fmt(num(s?.neighborCooling)*num(s?.fire?.coolingTime)/1000)} m³</b>.</p>
    <p>Solução de espuma primária: <b>${fmt(s?.foamMain)} L/min</b> × ${fmt(s?.fire?.foamTime,0)} min = <b>${fmt(num(s?.foamMain)*num(s?.fire?.foamTime)/1000)} m³</b>.</p>
    <p>Solução de espuma secundária/bacia: <b>${fmt((s?.secondary?.solutionVolume||s?.basinApplication?.solutionVolume)/1000)} m³</b>.</p>
    <p><b>6. Volume total do cenário:</b> resfriamento ${fmt(s?.coolingVolume)} + espuma ${fmt(s?.foamVolume)} = <b>${fmt(b.combat)} m³</b>.</p>
    <p><b>7. Parcela de combate adotada na contenção:</b> 50% × ${fmt(b.combat)} = <b>${fmt(.5*b.combat)} m³</b>.</p>
    <p><b>8. Volume das bases:</b> Σ bases = <b>${fmt(b.bases)} m³</b>.</p>
    <p><b>9. Volume geométrico exigido:</b> ${fmt(b.largest)} + ${fmt(.5*b.combat)} + ${fmt(b.bases)} = <b>${fmt(b.required)} m³</b>.</p>
    <p><b>10. Altura hidráulica:</b> ${fmt(b.required)} ÷ ${fmt(b.usefulArea)} = <b>${fmt(b.hydraulicHeight)} m</b>.</p>
    <p><b>11. Altura mínima:</b> ${fmt(b.hydraulicHeight)} + precipitação ${fmt(state.basin.rain)} + borda livre ${fmt(state.basin.freeboard)} = <b>${fmt(b.finalHeight)} m</b>.</p>`;
  renderBasinFields();
}
function renderDocs(type){
  const c=critical(),b=basinCalc(),date=new Date().toLocaleDateString('pt-BR'), rows=state.tanks.map(t=>{const thermal=normativeThermalAssessment(t);return `<tr><td>${t.tag}</td><td>${t.orientation}</td><td>${fmt(t.diameter)}</td><td>${fmt(t.usefulVolume)}</td><td>${t.product||'—'}</td><td>${classify(t)}</td><td>${fmt(t.storageTemperature)} °C</td><td>${thermal.adoptedClass||'—'}</td></tr>`}).join('');
  const thermalNotes=state.tanks.flatMap(t=>normativeThermalAssessment(t).messages.map(message=>`<li><b>${escapeText(t.tag)}:</b> ${escapeText(message)}</li>`)).join('')||'<li>Nenhuma alteração normativa decorrente da temperatura adotada.</li>';
  const base=`<div class="doc-header"><p>SAR — SISTEMA AVANÇADO DE RESPOSTA</p><h1>${type==='memory'?'MEMÓRIA DE CÁLCULO':'MEMORIAL DESCRITIVO'}</h1><p>${state.meta.name} · ${state.meta.reference||'Sem referência'} · ${date}</p></div>`;
  const tankTable=`<table><tr><th>ID</th><th>Tipo</th><th>Diâmetro (m)</th><th>Volume útil (m³)</th><th>Produto</th><th>Classe original</th><th>Temperatura máxima</th><th>Classe no cenário</th></tr>${rows}</table>`;
  if(type==='memory')$('#documentPreview').innerHTML=base+`<section><h2>1. Identificação</h2><p>Parque: ${state.meta.park}. Bacia: ${state.meta.basin}. Responsável técnico: ${state.meta.responsible}.</p></section><section><h2>2. Tanques e condição térmica</h2>${tankTable}<ul>${thermalNotes}</ul></section><section><h2>3. Cenários de incêndio</h2><p>Foram calculados ${c.ss.length} cenários direcionais, considerando cada tanque em chamas e seus vizinhos normativos.</p><p>Reserva crítica: <b>${fmt(c.water.totalVolume)} m³ (${c.water.fire.tag})</b>. Vazão crítica: <b>${fmt(c.flow.totalFlow)} L/min (${c.flow.fire.tag})</b>. LGE crítico: <b>${fmt(c.lge.lgeVolume)} m³ (${c.lge.fire.tag})</b>.</p></section><section><h2>4. Bacia</h2><p>Área útil: ${fmt(b.usefulArea)} m². Volume exigido: ${fmt(b.required)} m³. Altura hidráulica: ${fmt(b.hydraulicHeight)} m. Altura mínima calculada do dique: ${fmt(b.finalHeight)} m.</p></section><section><h2>5. Base normativa</h2><p>IT 25/2025 do CBPMESP, Partes 1, 2 e 3. Documento preliminar gerado pelo motor MVP; taxas, tempos e premissas informadas devem ser validados pelo responsável técnico.</p></section><div class="signature">_________________________________<br>${state.meta.responsible}<br>Responsável técnico</div>`;
  else $('#documentPreview').innerHTML=base+`<section><h2>1. Objeto</h2><p>Este memorial descreve os sistemas de proteção contra incêndio previstos para o ${state.meta.park}, composto por ${state.tanks.length} tanque(s) na ${state.meta.basin}.</p></section><section><h2>2. Instalação e condição térmica</h2>${tankTable}<ul>${thermalNotes}</ul></section><section><h2>3. Sistemas</h2><p>Os cenários contemplam proteção por solução de espuma no tanque em chamas, linhas suplementares quando indicadas, resfriamento do tanque em chamas e resfriamento dos tanques vizinhos. A operação simultânea governa a seleção de vazão e pressão; os tempos individuais governam as reservas.</p></section><section><h2>4. Bacia de contenção</h2><p>A bacia possui área interna de ${fmt(b.area)} m² e área útil efetiva de ${fmt(b.usefulArea)} m². A altura mínima calculada do dique é ${fmt(b.finalHeight)} m, incluídas as parcelas informadas para precipitação e borda livre.</p></section><section><h2>5. Operação e validação</h2><p>Equipamentos, desempenho hidráulico, compatibilidade do LGE, temperatura máxima prevista e catálogos deverão integrar o projeto técnico final. Este documento deve ser revisado e assinado pelo responsável técnico.</p></section><div class="signature">_________________________________<br>${state.meta.responsible}<br>Responsável técnico</div>`;
}
function validationIssues(){
  const sections=new Set();
  if(!state.tanks.length||state.tanks.some(t=>!t.tag||!t.diameter||!t.usefulVolume||!t.product))sections.add('Cadastro');
  if(state.tanks.some((a,i)=>state.tanks.slice(i+1).some(b=>state.distances?.[pairKey(a,b)]===undefined)))sections.add('Distâncias');
  if(state.tanks.some(t=>t.orientation!=='horizontal'&&t.foamNormative?.exigido!==false&&(!t.foamRate||!t.foamTime||!t.lgePercent))||!state.basin.secondaryLgePercent)sections.add('Espuma');
  if(state.tanks.some(t=>t.orientation!=='horizontal'&&(!t.coolingNormative||(!t.coolingNormative.isento&&!t.coolingTime))))sections.add('Resfriamento');
  return [...sections];
}
function renderScenarioReview(){
  const host=$('#scenarioReviewNote');if(!host)return;
  const issues=validationIssues();
  host.innerHTML=issues.length?`<span>✓</span> Revise ${issues.map(x=>`aba ${x}`).join(', ')} — dados faltantes.`:'<span>✓</span> Dados principais preenchidos para conferência dos cenários.';
  host.classList.toggle('complete',!issues.length);
}
function applySequentialTabOrder(){
  const active=$('.tab.active');if(!active)return;
  [...active.querySelectorAll('input:not([type="hidden"]),select,button,textarea')].filter(el=>!el.disabled&&!el.closest('[hidden]')).forEach((el,index)=>el.tabIndex=index+1);
}
function controlLocator(el){
  const attrs=['data-id','data-key','data-distance-key','data-foam-id','data-foam-key','data-cooling-id','data-cooling-key','data-cooling-neighbor-fire','data-cooling-neighbor-tank'];
  const parts=attrs.filter(name=>el.hasAttribute(name)).map(name=>`[${name}="${CSS.escape(el.getAttribute(name))}"]`);
  if(el.id)return `#${CSS.escape(el.id)}`;
  return `${el.tagName.toLowerCase()}${parts.join('')}`;
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||e.shiftKey)return;
  const current=e.target;
  const row=current.closest('tr');
  if(!row)return;
  const controls=[...row.querySelectorAll('input:not([type="hidden"]),select,button,textarea')].filter(el=>!el.disabled&&!el.closest('[hidden]'));
  const index=controls.indexOf(current);
  if(index<0||index>=controls.length-1)return;
  const locator=controlLocator(controls[index+1]);
  e.preventDefault();
  current.blur();
  requestAnimationFrame(()=>{const next=document.querySelector(locator);if(next){next.focus();if(next.select)next.select()}});
},true);
function validate(){renderScenarioReview()}
function renderAll(){renderTanks();renderDistances();renderProtection();renderResults();renderBasinFields();renderBasinManager();validate();applySequentialTabOrder()}
$('#tabs').onclick=e=>{const b=e.target.closest('button[data-tab]');if(!b)return;$$('#tabs button').forEach(x=>x.classList.toggle('active',x===b));$$('.tab').forEach(x=>x.classList.toggle('active',x.id===`tab-${b.dataset.tab}`));if(b.dataset.tab==='distancias')renderDistances();if(b.dataset.tab==='espuma')renderProtection();if(b.dataset.tab==='resfriamento')renderScenarioDetail();if(b.dataset.tab==='cenarios')renderCombinedScenarios();if(b.dataset.tab==='bacia')renderBasin();if(b.dataset.tab==='isolamento')renderBasinIsolation();if(b.dataset.tab==='consolidado')renderGlobalConsolidation();applySequentialTabOrder()}
$('#applyTankCount').onclick=()=>setCount($('#tankCount').value);$('#fireTank').onchange=renderDistances;$('#recalculate').onclick=analyzeAllNeighbors;
$('#openPrecipitationModule').onclick=()=>alert('O módulo de precipitação por localidade e tempo de recorrência será desenvolvido e conectado a este campo.');
$('#copyTankData').onclick=()=>{const source=state.tanks[0];state.tanks.slice(1).forEach(t=>['orientation','installation','roofType','diameter','height','length','usefulVolume'].forEach(k=>t[k]=source[k]));save();renderAll()};
$('#copyProductData').onclick=()=>{const source=state.tanks[0];state.tanks.slice(1).forEach(t=>['productId','product','productScientificName','productSource','flashPoint','boilingPoint','vaporPressure','vaporPressureConfirmed','liquidClass','miscibilityWater','foamGroup','classificationRuleVersion'].forEach(k=>t[k]=source[k]));save();renderAll()};
$('#copyBaseData').onclick=()=>{const source=state.tanks[0];state.tanks.slice(1).forEach(t=>['baseShape','baseDiameter','baseHeight','baseVolume','baseVolumeManual'].forEach(k=>t[k]=source[k]));save();renderAll()};
$('#copyPrimaryFoamData').onclick=()=>{const source=state.tanks[0];state.tanks.slice(1).forEach(t=>['foamApplicationType','foamRate','foamTime','lgePercent','equipmentModel','chamberCount','proportionerModel'].forEach(k=>t[k]=source[k]));save();renderAll()};
$('#addBasin').onclick=()=>{const n=system.basins.length+1,b=newBasin({meta:{...state.meta,basin:`Bacia ${String(n).padStart(2,'0')}`,park:state.meta.park}});system.basins.push(b);activateBasin(b.id)};
$('#exportStudy').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(system,null,2)],{type:'application/json'}));a.download=`sar-sistema-${state.meta.name.replace(/\W+/g,'-').toLowerCase()}.json`;a.click();URL.revokeObjectURL(a.href)};
$('#importStudy').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{system=normalizeSystem(JSON.parse(await e.target.files[0].text()));state=system.basins.find(b=>b.id===system.activeBasinId)||system.basins[0];bindStatic();save();renderAll();window.dispatchEvent(new CustomEvent('sar-tanques-json-importado'))}catch{alert('Arquivo JSON inválido.')}finally{e.target.value=''}};
$$('[data-doc]').forEach(b=>b.onclick=()=>renderDocs(b.dataset.doc));
bindStatic();renderAll();
window.SARTanques={
  get:()=>structuredClone(system),
  name:()=>state?.meta?.name||'Novo estudo',
  set:raw=>{system=normalizeSystem(raw);state=system.basins.find(b=>b.id===system.activeBasinId)||system.basins[0]||newBasin();selectedScenario=null;bindStatic();save();renderAll();analyzeAllVerticalFoam()},
  setProducts:products=>{productCatalog=Array.isArray(products)?products:[];renderTanks();analyzeAllVerticalFoam()},
  setThermalClassifier:classifier=>{thermalClassifier=typeof classifier==='function'?classifier:null},
  setDistanceAnalyzer:analyzer=>{distanceAnalyzer=typeof analyzer==='function'?analyzer:null},
  setVerticalFoamEngine:engine=>{verticalFoamEngine=typeof engine==='function'?engine:null;analyzeAllVerticalFoam()},
  setBasinFoamEngine:engine=>{basinFoamEngine=typeof engine==='function'?engine:null;analyzeBasinFoam()},
  setCoolingEngine:engine=>{coolingEngine=typeof engine==='function'?engine:null;analyzeAllCooling()},
  reset:()=>{
    localStorage.removeItem(SYSTEM_STORAGE);
    localStorage.removeItem(STORAGE);
    system={version:31,id:uid(),activeBasinId:null,basins:[],isolationRules:{}};
    state=newBasin();
    selectedScenario=null;
    bindStatic();
    save();
    renderAll();
  }
};
window.addEventListener('sar-tanques-produtos-carregados',event=>window.SARTanques.setProducts(event.detail||[]));
