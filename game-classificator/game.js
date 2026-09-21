(() => {
  "use strict";
  const button=document.getElementById("btnIniciar");
  const status=document.getElementById("statusGame");
  if(!button)return;
  let busy=false;
  button.addEventListener("click",async()=>{
    if(busy)return;busy=true;button.disabled=true;if(status)status.textContent="";
    try{const data=await window.SARClassificatorAPI.start();window.location.assign(data.next||"/game-classificator/estado/");}
    catch(error){console.error(error);if(status)status.textContent=error.message||"Não foi possível iniciar.";button.disabled=false;busy=false;}
  });
})();
