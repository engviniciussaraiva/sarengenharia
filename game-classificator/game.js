(() => {

  "use strict";

  const btnIniciar =
    document.getElementById("btnIniciar");

  const statusGame =
    document.getElementById("statusGame");


  if(!btnIniciar){
    console.error(
      "GAME ClassificaTOR: botão inicial não encontrado."
    );

    return;
  }


  let iniciando = false;


  function atualizarStatus(texto){

    if(statusGame){
      statusGame.textContent = texto || "";
    }

  }


  async function iniciarGame(){

    if(iniciando){
      return;
    }


    iniciando = true;

    btnIniciar.disabled = true;

    atualizarStatus(
      "Preparando classificação..."
    );


    try{

      const response = await fetch(
        "/api/game/classificator/start",
        {
          method:"POST",

          credentials:"same-origin",

          headers:{
            "Content-Type":"application/json",
            "Accept":"application/json",
            "X-Requested-With":"SAR-ClassificaTOR"
          },

          body:JSON.stringify({})
        }
      );


      if(!response.ok){

        throw new Error(
          `Erro ${response.status}`
        );

      }


      const data =
        await response.json();


      if(
        !data ||
        data.ok !== true ||
        typeof data.next !== "string" ||
        !data.next
      ){

        throw new Error(
          "Resposta inválida do servidor."
        );

      }


      atualizarStatus(
        "Iniciando..."
      );


      /*
        ESTA NAVEGAÇÃO ACONTECE SOMENTE
        DENTRO DO MÓDULO DO SAR.

        A BARRA PRINCIPAL CONTINUA:

        sarengenharia.com.br/sistema.html
      */

      window.location.assign(
        data.next
      );


    }catch(error){

      console.error(
        "GAME ClassificaTOR:",
        error
      );


      atualizarStatus(
        "Não foi possível iniciar. Tente novamente."
      );


      iniciando = false;

      btnIniciar.disabled = false;

    }

  }


  btnIniciar.addEventListener(
    "click",
    iniciarGame
  );

})();
