(() => {
  "use strict";

  const btn = document.getElementById("btnIniciar");
  const status = document.getElementById("statusGame");

  if (!btn || !status) return;

  async function iniciarGame() {
    if (btn.disabled) return;

    btn.disabled = true;
    status.textContent = "Preparando classificação...";

    try {
      const response = await fetch("/api/game/classificator/start", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "SAR-ClassificaTOR"
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error("Não foi possível iniciar o GAME.");
      }

      const data = await response.json();

      if (!data || data.ok !== true || typeof data.next !== "string") {
        throw new Error("Resposta inválida do servidor.");
      }

      status.textContent = "Iniciando...";
      window.location.assign(data.next);
    } catch (error) {
      console.error("GAME ClassificaTOR:", error);
      status.textContent = "Não foi possível iniciar. Tente novamente.";
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", iniciarGame);
})();
