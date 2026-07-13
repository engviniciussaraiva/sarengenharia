import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
    "https://bjtxbpmrmhfvpmdsthxr.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM";

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth:{
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:true
        }
    }
);

async function protegerSistema(){

    try{

        const { data, error } =
            await supabase.auth.getSession();

        if(error){
            throw error;
        }

        const usuario = data.session?.user;

        if(!usuario){
            window.location.replace("acesso.html");
            return;
        }

        const { data: cadastro, error: erroCadastro } =
            await supabase
                .from("sar_usuarios")
                .select("id, user_id, ativo, tipo_usuario")
                .eq("user_id", usuario.id)
                .maybeSingle();

        if(erroCadastro){
            throw erroCadastro;
        }

        if(!cadastro || cadastro.ativo !== true){
            window.location.replace("acesso.html");
            return;
        }

        document.body.style.visibility = "visible";

        window.dispatchEvent(
    new CustomEvent("sar:autorizado", {
        detail: {
            usuario,
            cadastro,
            supabase
        }
    })
);

    }catch(erro){

        console.error(
            "Erro ao validar acesso ao SAR:",
            erro
        );

        window.location.replace("acesso.html");
    }
}

async function sair(){

    await supabase.auth.signOut();

    window.location.replace("acesso.html");
}

window.SARGuard = {
    protegerSistema,
    sair,
    supabase
};

protegerSistema();
