export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      ok: false
    });
  }

  try {

    const codigo =
      String(req.query.codigo || "")
        .trim()
        .toUpperCase();

    if (!codigo) {
      return res.status(400).json({
        ok: false
      });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {

      console.error(
        "Variáveis do Supabase não configuradas."
      );

      return res.status(500).json({
        ok: false
      });
    }

    const url =
      `${supabaseUrl}/rest/v1/` +
      `sar_game_classificator_mensagens` +
      `?codigo=eq.${encodeURIComponent(codigo)}` +
      `&ativo=eq.true` +
      `&select=texto` +
      `&limit=1`;

    const response = await fetch(url, {

      method: "GET",

      headers: {
        "apikey": serviceRole,
        "Authorization": `Bearer ${serviceRole}`,
        "Accept": "application/json"
      }

    });

    if (!response.ok) {

      console.error(
        "Erro Supabase:",
        response.status
      );

      return res.status(500).json({
        ok: false
      });
    }

    const dados =
      await response.json();

    if (!Array.isArray(dados) || !dados.length) {

      return res.status(404).json({
        ok: false
      });
    }

    return res.status(200).json({
      ok: true,
      texto: dados[0].texto
    });

  } catch (error) {

    console.error(
      "GAME ClassificaTOR mensagem:",
      error
    );

    return res.status(500).json({
      ok: false
    });
  }
}
