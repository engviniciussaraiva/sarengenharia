import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = Object.freeze({
  supabaseUrl: "https://bjtxbpmrmhfvpmdsthxr.supabase.co",
  supabaseKey: "sb_publishable_E1Oxs2VdHcNrVbb7yIGnsg_zd6EYMvM",
  rotaAcesso: "acesso.html",
  rotaSistema: "sistema.html"
});

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const el = {
  estado: document.getElementById("estadoGeral"), login: document.getElementById("painelLogin"), aguardando: document.getElementById("painelAguardando"), bloqueado: document.getElementById("painelBloqueado"), erro: document.getElementById("painelErro"), nome: document.getElementById("aguardandoNome"), email: document.getElementById("aguardandoEmail"), mensagemErro: document.getElementById("mensagemErro"), btnGoogle: document.getElementById("btnGoogle"), btnSairAguardando: document.getElementById("btnSairAguardando"), btnSairBloqueado: document.getElementById("btnSairBloqueado"), btnSairErro: document.getElementById("btnSairErro"), btnTentar: document.getElementById("btnTentarNovamente")
};

function ocultar(){[el.login,el.aguardando,el.bloqueado,el.erro].forEach(p=>p.classList.remove("visivel"));}
function estado(msg,erro=false){el.estado.textContent=msg;el.estado.classList.toggle("erro",erro);}
function mostrar(p){ocultar();p.classList.add("visivel");}
function nomeGoogle(user){return user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email?.split("@")[0]||"Usuário SAR";}
function mostrarLogin(){estado("Nenhuma sessão ativa.");mostrar(el.login);}
function mostrarAguardando(user,cad){el.nome.textContent=cad?.nome||nomeGoogle(user);el.email.textContent=cad?.email||user?.email||"Não informado";estado("Usuário autenticado. Aprovação pendente.");mostrar(el.aguardando);}
function mostrarBloqueado(){estado("Usuário autenticado, porém sem acesso ativo.");mostrar(el.bloqueado);}
function mostrarErro(msg){console.error("[SAR Auth]",msg);el.mensagemErro.textContent=msg;estado("Falha no controle de acesso.",true);mostrar(el.erro);}

async function loginGoogle(){el.btnGoogle.disabled=true;estado("Redirecionando para o Google...");const redirectTo=new URL(CONFIG.rotaAcesso,window.location.href).href;const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});if(error){el.btnGoogle.disabled=false;mostrarErro(`Erro ao iniciar o Login Google: ${error.message}`);}}
async function sair(){estado("Encerrando sessão...");const {error}=await supabase.auth.signOut();if(error){mostrarErro(`Erro ao encerrar a sessão: ${error.message}`);return;}mostrarLogin();}
async function buscarCadastro(userId){const {data,error}=await supabase.from("sar_usuarios").select("id,user_id,nome,email,tipo_usuario,ativo,ultimo_login").eq("user_id",userId).maybeSingle();if(error)throw new Error(`Não foi possível consultar sar_usuarios: ${error.message}`);return data;}
async function atualizarUltimoLogin(cadastroId){const {error}=await supabase.rpc("sar_registrar_login",{p_cadastro_id:cadastroId});if(error)console.warn("[SAR Auth] ultimo_login não atualizado:",error.message);}
function abrirSistema(){window.location.replace(CONFIG.rotaSistema);}
async function processarUsuario(user){estado("Validando cadastro e autorização...");let cadastro=await buscarCadastro(user.id);if(!cadastro){await new Promise(r=>setTimeout(r,700));cadastro=await buscarCadastro(user.id);}if(!cadastro)throw new Error("Usuário autenticado, mas cadastro interno não encontrado. Verifique o trigger de sar_usuarios.");await atualizarUltimoLogin(cadastro.id);if(cadastro.ativo===true){estado("Acesso autorizado. Abrindo o SAR...");abrirSistema();return;}if(cadastro.tipo_usuario==="teste"){mostrarAguardando(user,cadastro);return;}mostrarBloqueado();}
async function iniciar(){try{ocultar();estado("Verificando sessão segura...");const {data,error}=await supabase.auth.getSession();if(error)throw new Error(`Erro ao verificar sessão: ${error.message}`);const user=data.session?.user;if(!user){mostrarLogin();return;}await processarUsuario(user);}catch(error){mostrarErro(error instanceof Error?error.message:String(error));}}

el.btnGoogle.addEventListener("click",loginGoogle);el.btnSairAguardando.addEventListener("click",sair);el.btnSairBloqueado.addEventListener("click",sair);el.btnSairErro.addEventListener("click",sair);el.btnTentar.addEventListener("click",iniciar);
supabase.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){mostrarLogin();return;}if(event==="SIGNED_IN"&&session?.user){processarUsuario(session.user).catch(e=>mostrarErro(e instanceof Error?e.message:String(e)));}});
iniciar();
window.SARAuth=Object.freeze({iniciar,loginGoogle,sair,supabase});
