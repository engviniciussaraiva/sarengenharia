(() => {
  "use strict";

  const API_START = "/api/game/classificator/start";

  let iniciando = false;

  function localizarBotaoIniciar() {
    return (
      document.getElementById("btnIniciar") ||
      document.getElementById("startGame") ||
      document.querySelector('[data-action="start-game"]') ||
      document.querySelector(".start-button") ||
      document.querySelector(".btn-iniciar")
    );
  }

  async function iniciarGame() {
    if (iniciando) return;

    iniciando = true;

    const botao = localizarBotaoIniciar();

    if (botao) {
      botao.style.pointerEvents = "none";
      botao.setAttribute("aria-busy", "true");
    }

    try {
      const response = await fetch(API_START, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Não foi possível iniciar o GAME.");
      }

      const data = await response.json();

      if (!data.ok || !data.next) {
        throw new Error("Resposta inválida do servidor.");
      }

      abrirFase(data.next);

    } catch (error) {
      console.error("GAME ClassificaTOR:", error);

      alert(
        "Não foi possível iniciar o GAME ClassificaTOR. Tente novamente."
      );

    } finally {
      iniciando = false;

      if (botao) {
        botao.style.pointerEvents = "";
        botao.removeAttribute("aria-busy");
      }
    }
  }

  function abrirFase(fase) {
    /*
      IMPORTANTE:

      Não usamos:
      window.location.href
      location.assign()
      location.replace()

      O GAME continua dentro do sistema.html.
    */

    if (fase === "fase-01") {
      prepararFase01();
      return;
    }

    console.error("Fase não reconhecida:", fase);
  }

  function prepararFase01() {
    /*
      A FASE 01 será construída no próximo passo.

      Por enquanto confirmamos apenas que:
      1. O botão INICIAR funcionou;
      2. A Vercel Function respondeu;
      3. A sessão protegida foi criada;
      4. Não houve mudança de URL.
    */

    document.dispatchEvent(
      new CustomEvent("classificator:fase", {
        detail: {
          fase: "fase-01"
        }
      })
    );

    console.log("GAME ClassificaTOR: Fase 01 autorizada.");
  }

  function configurar() {
    const botao = localizarBotaoIniciar();

    if (!botao) {
      console.warn(
        "GAME ClassificaTOR: botão INICIAR não encontrado."
      );

      return;
    }

    botao.addEventListener("click", iniciarGame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configurar);
  } else {
    configurar();
  }
})();
