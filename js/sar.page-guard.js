/**
 * ============================================================
 * SAR ENGENHARIA — PROTEÇÃO DE PÁGINAS INTERNAS
 * Arquivo: /js/sar.page-guard.js
 * ============================================================
 *
 * OBJETIVO
 *
 * 1. Impedir ferramenta aberta diretamente pela URL.
 * 2. Exigir sessão válida no Supabase.
 * 3. Verificar a permissão específica da ferramenta.
 * 4. Permitir a página somente dentro do iframe do sistema.html.
 *
 * INSTALAÇÃO EM CADA FERRAMENTA
 *
 * Coloque no início do <head>, antes dos demais scripts:
 *
 * <meta
 *   name="sar-recurso-codigo"
 *   content="CODIGO_EXATO_DO_RECURSO"
 * >
 *
 * <script src="/js/sar.page-guard.js"></script>
 *
 * O código precisa ser exatamente igual ao campo:
 *
 * public.sar_modulos.codigo
 * ============================================================
 */

(function () {
    "use strict";

    const SAR_CONFIG = {
        supabaseUrl:
            "https://bjtxbpmrmhfvpmdsthxr.supabase.co",

        supabaseAnonKey:
            "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM",

        paginaLogin:
            "/acesso.html",

        paginaSistema:
            "/sistema.html"
    };

    /*
     * Esconde a página imediatamente para evitar que o conteúdo
     * apareça antes da validação.
     */
    document.documentElement.style.visibility = "hidden";

    document.documentElement.setAttribute(
        "data-sar-validando",
        "true"
    );

    function normalizarCodigo(valor) {
        return String(valor || "")
            .trim()
            .toUpperCase();
    }

    function obterCodigoDaPagina() {
        const meta = document.querySelector(
            'meta[name="sar-recurso-codigo"]'
        );

        return normalizarCodigo(
            meta ? meta.content : ""
        );
    }

    function mostrarPagina() {
        document.documentElement.style.visibility =
            "visible";

        document.documentElement.removeAttribute(
            "data-sar-validando"
        );

        document.documentElement.setAttribute(
            "data-sar-autorizado",
            "true"
        );
    }

    function escaparHtml(valor) {
        return String(valor == null ? "" : valor)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function redirecionarParaLogin() {
        const destinoAtual =
            window.location.pathname +
            window.location.search;

        const url =
            SAR_CONFIG.paginaLogin +
            "?retorno=" +
            encodeURIComponent(destinoAtual);

        window.location.replace(url);
    }

    function redirecionarParaSistema() {
        window.location.replace(
            SAR_CONFIG.paginaSistema
        );
    }

    function estaDentroDoSistema() {
        try {
            return window.self !== window.top;
        } catch (erro) {
            return true;
        }
    }

    function mostrarAcessoNegado(
        codigo,
        mensagem
    ) {
        const codigoSeguro =
            escaparHtml(codigo || "NÃO INFORMADO");

        const mensagemSegura =
            escaparHtml(
                mensagem ||
                "Este recurso não está liberado para seu usuário."
            );

        document.documentElement.style.visibility =
            "visible";

        document.documentElement.removeAttribute(
            "data-sar-validando"
        );

        document.documentElement.setAttribute(
            "data-sar-bloqueado",
            "true"
        );

        document.body.innerHTML = `
            <main
                style="
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    padding: 30px;
                    background: #f3f6f5;
                    font-family:
                        Arial,
                        Helvetica,
                        sans-serif;
                    color: #243b3b;
                "
            >
                <section
                    style="
                        width: 100%;
                        max-width: 560px;
                        box-sizing: border-box;
                        padding: 32px;
                        background: #ffffff;
                        border: 1px solid #d9e2df;
                        border-radius: 14px;
                        box-shadow:
                            0 18px 45px
                            rgba(0, 0, 0, 0.09);
                    "
                >
                    <div
                        style="
                            margin-bottom: 12px;
                            color: #b42318;
                            font-size: 13px;
                            font-weight: 800;
                            letter-spacing: 0.5px;
                            text-transform: uppercase;
                        "
                    >
                        Acesso não autorizado
                    </div>

                    <h1
                        style="
                            margin: 0 0 14px;
                            color: #285858;
                            font-size: 27px;
                            line-height: 1.2;
                        "
                    >
                        Recurso não liberado
                    </h1>

                    <p
                        style="
                            margin: 0 0 12px;
                            color: #455b5b;
                            font-size: 16px;
                            line-height: 1.6;
                        "
                    >
                        ${mensagemSegura}
                    </p>

                    <div
                        style="
                            margin: 20px 0 26px;
                            padding: 13px 15px;
                            background: #f4f7f6;
                            border: 1px solid #e0e7e5;
                            border-radius: 8px;
                            color: #607171;
                            font-size: 13px;
                        "
                    >
                        Código do recurso:
                        <strong>
                            ${codigoSeguro}
                        </strong>
                    </div>

                    <button
                        id="sarPageGuardVoltar"
                        type="button"
                        style="
                            min-height: 44px;
                            padding: 0 20px;
                            border: none;
                            border-radius: 8px;
                            background: #315f5f;
                            color: #ffffff;
                            font-size: 14px;
                            font-weight: 700;
                            cursor: pointer;
                        "
                    >
                        Voltar ao SAR
                    </button>
                </section>
            </main>
        `;

        document
            .getElementById(
                "sarPageGuardVoltar"
            )
            ?.addEventListener(
                "click",
                redirecionarParaSistema
            );
    }

    function localizarPermissao(
        permissoes,
        codigo
    ) {
        if (!Array.isArray(permissoes)) {
            return null;
        }

        return permissoes.find(
            function (permissao) {
                return (
                    normalizarCodigo(
                        permissao.codigo
                    ) === codigo
                );
            }
        ) || null;
    }

    async function carregarSupabase() {
        const modulo =
            await import(
                "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
            );

        return modulo.createClient(
            SAR_CONFIG.supabaseUrl,
            SAR_CONFIG.supabaseAnonKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );
    }

    async function validarPagina() {
        const codigo =
            obterCodigoDaPagina();

        /*
         * Toda página protegida precisa informar seu código.
         */
        if (!codigo) {
            mostrarAcessoNegado(
                "",
                "Esta página não possui um código de permissão configurado."
            );

            console.error(
                "SAR Page Guard:",
                "meta sar-recurso-codigo não encontrada."
            );

            return;
        }

        let supabase;

        try {
            supabase =
                await carregarSupabase();
        } catch (erro) {
            console.error(
                "SAR Page Guard — erro ao carregar Supabase:",
                erro
            );

            mostrarAcessoNegado(
                codigo,
                "Não foi possível iniciar a validação de segurança."
            );

            return;
        }

        const {
            data: sessaoData,
            error: sessaoErro
        } = await supabase.auth.getSession();

        if (sessaoErro) {
            console.error(
                "SAR Page Guard — erro de sessão:",
                sessaoErro
            );

            redirecionarParaLogin();
            return;
        }

        const sessao =
            sessaoData &&
            sessaoData.session;

        if (
            !sessao ||
            !sessao.user
        ) {
            redirecionarParaLogin();
            return;
        }

        /*
         * Mesmo estando logado, uma ferramenta não deve abrir
         * diretamente como página principal.
         *
         * Ela precisa ser carregada pelo sistema.html.
         */
        if (!estaDentroDoSistema()) {
            redirecionarParaSistema();
            return;
        }

        const {
            data: permissoes,
            error: permissoesErro
        } = await supabase.rpc(
            "sar_minhas_permissoes"
        );

        if (permissoesErro) {
            console.error(
                "SAR Page Guard — erro ao consultar permissões:",
                permissoesErro
            );

            mostrarAcessoNegado(
                codigo,
                permissoesErro.message ||
                "Não foi possível confirmar sua permissão."
            );

            return;
        }

        const permissao =
            localizarPermissao(
                permissoes,
                codigo
            );

        if (
            !permissao ||
            permissao.visualizar !== true
        ) {
            mostrarAcessoNegado(
                codigo,
                "Este recurso não está liberado para seu usuário."
            );

            return;
        }

        /*
         * Disponibiliza a permissão para a própria ferramenta.
         *
         * Exemplo:
         *
         * window.SAR_PAGINA_PERMISSAO.editar
         */
        window.SAR_PAGINA_PERMISSAO =
            Object.freeze({
                codigo: codigo,

                moduloId:
                    permissao.modulo_id ||
                    null,

                visualizar:
                    permissao.visualizar ===
                    true,

                editar:
                    permissao.editar ===
                    true,

                excluir:
                    permissao.excluir ===
                    true,

                administrar:
                    permissao.administrar ===
                    true
            });

        /*
         * Evento para ferramentas que precisem esperar
         * a autorização antes de inicializar.
         */
        window.dispatchEvent(
            new CustomEvent(
                "sar:pagina-autorizada",
                {
                    detail:
                        window
                            .SAR_PAGINA_PERMISSAO
                }
            )
        );

        mostrarPagina();
    }

    validarPagina().catch(
        function (erro) {
            console.error(
                "SAR Page Guard — falha inesperada:",
                erro
            );

            mostrarAcessoNegado(
                obterCodigoDaPagina(),
                "Ocorreu uma falha inesperada ao validar o acesso."
            );
        }
    );
})();
