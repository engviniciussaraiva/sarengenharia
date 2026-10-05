(function(){
  "use strict";

  const state={file:null,zoom:1,referencePoints:[],jobId:null,lines:[],naturalWidth:0,naturalHeight:0};
  const content=document.getElementById("sarDxfContent");
  const tabs=[...document.querySelectorAll(".sar-dxf-tab")];

  function home(){
    tabs.forEach(t=>t.classList.remove("is-active"));
    content.innerHTML='<div class="sar-dxf-home"><div><h1>Automação DXF/CAD</h1><p>Selecione uma automação acima.</p></div></div>';
  }
  function active(page){tabs.forEach(t=>t.classList.toggle("is-active",t.dataset.page===page));}
  function future(title){content.innerHTML=`<div class="sar-dxf-coming"><div><h2>${title}</h2><p>Automação preparada para desenvolvimento futuro.</p></div></div>`;}
  function openPage(page){
    active(page);
    if(page==="croqui") return renderCroqui();
    const titles={pdf:"PDF → DXF",imagem:"Imagem → DXF",coordenadas:"Coordenadas → DXF",outras:"Outras Automações"};
    future(titles[page]||"Automação DXF/CAD");
  }

  function renderCroqui(){
    Object.assign(state,{file:null,zoom:1,referencePoints:[],jobId:null,lines:[],naturalWidth:0,naturalHeight:0});
    content.innerHTML=`
    <div class="sar-dxf-container">
      <header class="sar-dxf-header"><h1>Croqui → DXF</h1><p>Envie o croqui, defina uma medida conhecida e gere o DXF editável.</p></header>
      <div class="sar-dxf-grid">
        <div>
          <section class="sar-card"><div class="sar-card-header"><div class="sar-step"><div class="sar-step-number">1</div><div><h2>Enviar croqui</h2><p>JPG ou PNG nesta primeira versão operacional.</p></div></div></div><div class="sar-card-body">
            <label class="sar-upload" for="sarCroquiFile"><div class="sar-upload-icon">⇧</div><strong>Clique para selecionar um arquivo</strong><small>JPG ou PNG</small></label>
            <input id="sarCroquiFile" class="sar-file-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png">
            <div id="sarSelectedFile" class="sar-file-box"><div id="sarSelectedFileName" class="sar-file-name"></div><div id="sarSelectedFileInfo" class="sar-file-info"></div></div>
          </div></section>

          <section class="sar-card"><div class="sar-card-header"><div class="sar-step"><div class="sar-step-number">2</div><div><h2>Medida de referência</h2><p>Informe a medida e marque seus dois extremos na imagem.</p></div></div></div><div class="sar-card-body">
            <label class="sar-label" for="sarReferenceMeasure">Medida real</label>
            <div class="sar-form-row"><input id="sarReferenceMeasure" class="sar-input sar-required" type="number" min="0" step="0.01" placeholder="Ex.: 4,00"><select id="sarReferenceUnit" class="sar-select"><option value="m">metros (m)</option><option value="cm">centímetros (cm)</option><option value="mm">milímetros (mm)</option></select></div>
            <div class="sar-help">Clique na pré-visualização exatamente no início e no fim da dimensão conhecida.</div>
            <div id="sarReferenceStatus" class="sar-reference-status">Pontos marcados: 0/2</div>
            <button id="sarClearReference" class="sar-btn" type="button" style="margin-top:9px;width:100%">Limpar pontos de referência</button>
          </div></section>

          <section class="sar-card"><div class="sar-card-header"><div class="sar-step"><div class="sar-step-number">3</div><div><h2>Processar croqui</h2><p>O motor SAR detectará segmentos e aplicará a escala.</p></div></div></div><div class="sar-card-body">
            <button id="sarProcessButton" class="sar-btn sar-btn-primary">Processar croqui</button><div id="sarStatus" class="sar-status"></div><div id="sarResult" class="sar-result"></div>
          </div></section>

          <section class="sar-card"><div class="sar-card-header"><div class="sar-step"><div class="sar-step-number">4</div><div><h2>Gerar DXF</h2><p>Gere o arquivo vetorial na escala calculada.</p></div></div></div><div class="sar-card-body"><button id="sarGenerateButton" class="sar-btn sar-btn-primary" disabled>Gerar DXF</button></div></section>
        </div>

        <div><section class="sar-card sar-preview-card"><div class="sar-preview-toolbar"><div class="sar-preview-title">Pré-visualização / referência</div><div class="sar-preview-actions"><button id="sarZoomOut" type="button">−</button><button id="sarZoomReset" type="button">100%</button><button id="sarZoomIn" type="button">+</button></div></div>
          <div class="sar-preview-wrap"><div id="sarPreviewEmpty" class="sar-preview-empty"><strong>Nenhum arquivo carregado</strong>Envie um JPG ou PNG para começar.</div><div id="sarPreviewStage" class="sar-preview-stage" style="display:none"><img id="sarPreviewImage" class="sar-preview-image" alt="Pré-visualização do croqui"><canvas id="sarPreviewCanvas" class="sar-preview-canvas"></canvas></div></div>
        </section></div>
      </div>
    </div>`;
    bind();
  }

  function bind(){
    document.getElementById("sarCroquiFile").addEventListener("change",handleFile);
    document.getElementById("sarClearReference").addEventListener("click",clearReference);
    document.getElementById("sarProcessButton").addEventListener("click",process);
    document.getElementById("sarGenerateButton").addEventListener("click",generate);
    document.getElementById("sarZoomOut").addEventListener("click",()=>setZoom(state.zoom-.1));
    document.getElementById("sarZoomReset").addEventListener("click",()=>setZoom(1));
    document.getElementById("sarZoomIn").addEventListener("click",()=>setZoom(state.zoom+.1));
  }

  function handleFile(e){
    const file=e.target.files&&e.target.files[0]; if(!file)return;
    state.file=file;state.referencePoints=[];state.jobId=null;state.lines=[];
    document.getElementById("sarGenerateButton").disabled=true;
    document.getElementById("sarSelectedFile").classList.add("is-visible");
    document.getElementById("sarSelectedFileName").textContent=file.name;
    document.getElementById("sarSelectedFileInfo").textContent=formatSize(file.size);
    const reader=new FileReader();
    reader.onload=function(ev){
      const img=document.getElementById("sarPreviewImage");
      img.onload=function(){state.naturalWidth=img.naturalWidth;state.naturalHeight=img.naturalHeight;document.getElementById("sarPreviewEmpty").style.display="none";document.getElementById("sarPreviewStage").style.display="inline-block";img.classList.add("is-visible");resizeCanvas();clearReference();};
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function resizeCanvas(){
    const img=document.getElementById("sarPreviewImage"),canvas=document.getElementById("sarPreviewCanvas"); if(!img||!canvas)return;
    const w=img.clientWidth,h=img.clientHeight;if(!w||!h)return;
    canvas.width=Math.round(w);canvas.height=Math.round(h);canvas.style.width=w+"px";canvas.style.height=h+"px";
    canvas.onclick=canvasClick;draw();
  }
  function canvasClick(e){
    if(state.referencePoints.length>=2)return;
    const c=e.currentTarget,r=c.getBoundingClientRect();
    const xd=(e.clientX-r.left)/state.zoom,yd=(e.clientY-r.top)/state.zoom;
    state.referencePoints.push({x:xd*(state.naturalWidth/c.width),y:yd*(state.naturalHeight/c.height)});updateRef();draw();
  }
  function clearReference(){state.referencePoints=[];updateRef();draw();}
  function updateRef(){const el=document.getElementById("sarReferenceStatus");if(!el)return;if(state.referencePoints.length<2){el.textContent=`Pontos marcados: ${state.referencePoints.length}/2`;return;}const[a,b]=state.referencePoints;el.textContent=`Referência definida: ${Math.hypot(b.x-a.x,b.y-a.y).toFixed(1)} px`;}
  function draw(){
    const c=document.getElementById("sarPreviewCanvas");if(!c)return;const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);
    if(state.lines.length){ctx.lineWidth=2;ctx.strokeStyle="rgba(0,150,70,.78)";ctx.beginPath();state.lines.forEach(l=>{ctx.moveTo(l.x1*c.width/state.naturalWidth,l.y1*c.height/state.naturalHeight);ctx.lineTo(l.x2*c.width/state.naturalWidth,l.y2*c.height/state.naturalHeight)});ctx.stroke();}
    const pts=state.referencePoints.map(p=>({x:p.x*c.width/state.naturalWidth,y:p.y*c.height/state.naturalHeight}));ctx.fillStyle="#d09200";ctx.strokeStyle="#d09200";ctx.lineWidth=2;pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill()});if(pts.length===2){ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);ctx.lineTo(pts[1].x,pts[1].y);ctx.stroke();}
  }

  async function process(){
    const status=document.getElementById("sarStatus"),result=document.getElementById("sarResult"),button=document.getElementById("sarProcessButton");status.classList.add("is-visible");result.classList.remove("is-visible");
    const measure=Number(document.getElementById("sarReferenceMeasure").value),unit=document.getElementById("sarReferenceUnit").value;
    if(!state.file){status.textContent="Selecione primeiro um JPG ou PNG.";return;}if(!Number.isFinite(measure)||measure<=0){status.textContent="Informe uma medida real de referência.";return;}if(state.referencePoints.length!==2){status.textContent="Marque os dois extremos da medida de referência na imagem.";return;}if(!window.SARAPI){status.textContent="Conector SAR API não foi carregado.";return;}
    const[a,b]=state.referencePoints;const fd=new FormData();fd.append("arquivo",state.file);fd.append("medida_referencia",String(measure));fd.append("unidade",unit);fd.append("ref_x1",String(a.x));fd.append("ref_y1",String(a.y));fd.append("ref_x2",String(b.x));fd.append("ref_y2",String(b.y));
    button.disabled=true;status.textContent="Processando croqui no motor SAR...";
    try{
      const data=await window.SARAPI.request("/api/automacao-dxf-cad/analisar",{method:"POST",body:fd});
      state.jobId=data.job_id;state.lines=data.linhas||[];draw();status.textContent="Croqui processado com sucesso.";result.innerHTML=`<strong>${data.quantidade_linhas}</strong> segmentos detectados.<br>Escala calculada: <strong>${Number(data.mm_por_pixel).toFixed(4)} mm/pixel</strong>.`;result.classList.add("is-visible");document.getElementById("sarGenerateButton").disabled=false;
    }catch(err){state.jobId=null;document.getElementById("sarGenerateButton").disabled=true;status.textContent="Falha no processamento: "+(err&&err.message?err.message:"erro desconhecido");}
    finally{button.disabled=false;}
  }

  async function generate(){
    if(!state.jobId||!window.SARAPI)return;
    const b=document.getElementById("sarGenerateButton");b.disabled=true;b.textContent="Gerando DXF...";
    try{
      const data=await window.SARAPI.post("/api/automacao-dxf-cad/gerar-dxf",{job_id:state.jobId});
      const binary=atob(data.arquivo_base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const blob=new Blob([bytes],{type:"application/dxf"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=data.nome_arquivo||"croqui.dxf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(err){alert("Não foi possível gerar o DXF: "+(err&&err.message?err.message:"erro desconhecido"));}
    finally{b.disabled=false;b.textContent="Gerar DXF";}
  }
  function setZoom(v){state.zoom=Math.max(.5,Math.min(2,v));const s=document.getElementById("sarPreviewStage");if(s)s.style.transform=`scale(${state.zoom})`;}
  function formatSize(n){if(n<1024)return n+" bytes";if(n<1048576)return(n/1024).toFixed(1)+" KB";return(n/1048576).toFixed(1)+" MB";}
  tabs.forEach(t=>t.addEventListener("click",()=>openPage(t.dataset.page)));window.addEventListener("resize",()=>{const i=document.getElementById("sarPreviewImage");if(i&&i.classList.contains("is-visible"))resizeCanvas()});home();
})();
