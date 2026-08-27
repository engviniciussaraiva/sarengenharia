export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  /*
   * =========================================================
   * GAME CLASSIFICATOR
   * API DE MENSAGENS
   *
   * Variáveis exclusivas do GAME:
   *
   * GAME_SUPABASE_URL
   * GAME_SUPABASE_SECRET_KEY
   *
   * A chave secreta NUNCA é enviada ao navegador.
   * =========================================================
   */


  /*
   * SOMENTE GET
   */

  if (req.method !== "GET") {

    res.setHeader("Allow", "GET");

    return res.status(405).json({
      ok: false,
      erro: "METODO_NAO_PERMITIDO"
    });

  }


  try {

    /*
     * CÓDIGO DA MENSAGEM
     */

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


    /*
     * ACEITA SOMENTE CÓDIGOS NO PADRÃO:
     *
     * FASE_01_UMA_EDIFICACAO
     *
     * Isso evita valores estranhos chegando
     * à consulta.
     */

    if (!/^[A-Z0-9_]{3,100}$/.test(codigo)) {

      return res.status(400).json({
        ok: false,
        erro: "CODIGO_INVALIDO"
      });

    }


    /*
     * VARIÁVEIS EXCLUSIVAS DO GAME
     */

    const supabaseUrl =
      process.env.GAME_SUPABASE_URL;

    const supabaseSecretKey =
      process.env.GAME_SUPABASE_SECRET_KEY;


    /*
     * CONFERE CONFIGURAÇÃO
     */

    if (!supabaseUrl) {

      console.error(
        "GAME ClassificaTOR: GAME_SUPABASE_URL ausente."
      );

      return res.status(500).json({
        ok: false,
        erro: "GAME_SUPABASE_URL_AUSENTE"
      });

    }


    if (!supabaseSecretKey) {

      console.error(
        "GAME ClassificaTOR: GAME_SUPABASE_SECRET_KEY ausente."
      );

      return res.status(500).json({
        ok: false,
        erro: "GAME_SUPABASE_SECRET_KEY_AUSENTE"
      });

    }


    /*
     * REMOVE BARRA FINAL DA URL,
     * CASO TENHA SIDO CADASTRADA.
     */

    const baseUrl =
      supabaseUrl.replace(/\/+$/, "");


    /*
     * CONSULTA SOMENTE:
     *
     * codigo informado
     * ativo = true
     *
     * E DEVOLVE SOMENTE:
     *
     * texto
     */

    const endpoint =
      `${baseUrl}/rest/v1/` +
      `sar_game_classificator_mensagens` +
      `?codigo=eq.${encodeURIComponent(codigo)}` +
      `&ativo=eq.true` +
      `&select=texto` +
      `&limit=1`;


    /*
     * IMPORTANTE:
     *
     * A nova Secret Key do Supabase:
     *
     * sb_secret_...
     *
     * é enviada pelo header "apikey".
     *
     * NÃO usamos:
     *
     * Authorization: Bearer
     *
     * porque essa nova chave não é um JWT.
     */

    const response = await fetch(
      endpoint,
      {
        method: "GET",

        headers: {
          "apikey": supabaseSecretKey,
          "Accept": "application/json"
        }
      }
    );


    /*
     * ERRO NA COMUNICAÇÃO COM SUPABASE
     */

    if (!response.ok) {

      const detalhe =
        await response.text();

      console.error(
        "GAME ClassificaTOR - Supabase:",
        response.status,
        detalhe
      );


      /*
       * Não devolvemos detalhes internos
       * nem qualquer chave ao navegador.
       */

      return res.status(500).json({
        ok: false,
        erro: "SUPABASE_REQUISICAO_FALHOU",
        status: response.status
      });

    }


    /*
     * RESULTADO
     */

    const dados =
      await response.json();


    if (
      !Array.isArray(dados) ||
      dados.length === 0
    ) {

      console.warn(
        "GAME ClassificaTOR: mensagem não encontrada:",
        codigo
      );

      return res.status(404).json({
        ok: false,
        erro: "MENSAGEM_NAO_ENCONTRADA"
      });

    }


    const texto =
      String(
        dados[0]?.texto || ""
      ).trim();


    if (!texto) {

      return res.status(404).json({
        ok: false,
        erro: "MENSAGEM_VAZIA"
      });

    }


    /*
     * ÚNICA INFORMAÇÃO DO BANCO
     * DEVOLVIDA AO FRONTEND:
     *
     * O TEXTO DA MENSAGEM.
     */

    return res.status(200).json({
      ok: true,
      texto: texto
    });


  } catch (error) {

    console.error(
      "GAME ClassificaTOR - erro interno:",
      error
    );


    return res.status(500).json({
      ok: false,
      erro: "ERRO_INTERNO"
    });

  }

}
