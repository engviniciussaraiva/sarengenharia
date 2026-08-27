export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {

    res.setHeader("Allow", "GET");

    return res.status(405).json({
      ok: false,
      erro: "METODO_NAO_PERMITIDO"
    });

  }


  try {

    const codigo = String(
      req.query.codigo || ""
    )
      .trim()
      .toUpperCase();


    if (!codigo) {

      return res.status(400).json({
        ok: false,
        erro: "CODIGO_AUSENTE"
      });

    }


    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    /*
     * Não mostramos nenhuma chave na resposta.
     */

    if (!supabaseUrl) {

      console.error(
        "GAME ClassificaTOR: SUPABASE_URL ausente."
      );

      return res.status(500).json({
        ok: false,
        erro: "SUPABASE_URL_AUSENTE"
      });

    }


    if (!supabaseKey) {

      console.error(
        "GAME ClassificaTOR: SUPABASE_SERVICE_ROLE_KEY ausente."
      );

      return res.status(500).json({
        ok: false,
        erro: "SUPABASE_KEY_AUSENTE"
      });

    }


    const baseUrl =
      supabaseUrl.replace(/\/+$/, "");


    const endpoint =
      `${baseUrl}/rest/v1/sar_game_classificator_mensagens` +
      `?codigo=eq.${encodeURIComponent(codigo)}` +
      `&ativo=eq.true` +
      `&select=texto` +
      `&limit=1`;


    /*
     * Cabeçalhos compatíveis tanto com
     * chave antiga JWT quanto com chave
     * secreta nova do Supabase.
     */

    const headers = {
      "apikey": supabaseKey,
      "Accept": "application/json"
    };


    /*
     * Chaves antigas service_role normalmente
     * são JWT e começam com "eyJ".
     *
     * Nesse caso também usamos Authorization.
     */

    if (supabaseKey.startsWith("eyJ")) {

      headers["Authorization"] =
        `Bearer ${supabaseKey}`;

    }


    const response = await fetch(
      endpoint,
      {
        method: "GET",
        headers
      }
    );


    if (!response.ok) {

      const detalhe =
        await response.text();

      console.error(
        "GAME ClassificaTOR - erro Supabase:",
        response.status,
        detalhe
      );


      /*
       * Não devolvemos chave ou detalhes
       * internos para o navegador.
       */

      return res.status(500).json({
        ok: false,
        erro: "SUPABASE_REQUISICAO_FALHOU",
        status: response.status
      });

    }


    const dados =
      await response.json();


    if (
      !Array.isArray(dados) ||
      dados.length === 0
    ) {

      console.error(
        "GAME ClassificaTOR: mensagem não encontrada:",
        codigo
      );

      return res.status(404).json({
        ok: false,
        erro: "MENSAGEM_NAO_ENCONTRADA"
      });

    }


    const texto =
      String(dados[0]?.texto || "").trim();


    if (!texto) {

      return res.status(404).json({
        ok: false,
        erro: "MENSAGEM_VAZIA"
      });

    }


    return res.status(200).json({
      ok: true,
      texto
    });


  } catch (error) {

    console.error(
      "GAME ClassificaTOR - mensagem:",
      error
    );


    return res.status(500).json({
      ok: false,
      erro: "ERRO_INTERNO"
    });

  }

}
