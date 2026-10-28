import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yrxtarhmiwxdpexdekpz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Jxy85fbMXX_-klpiH5KKKw_VcUTjV2b";
const BUCKET = "family-media";
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const state = { user: null, profile: null, signup: false, profiles: [], conversations: [], active: null, messages: [], channel: null, installPrompt: null };

function status(id, text, good = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("good", good);
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function initials(name) { return (name || "?").trim().split(/\s+/).slice(0,2).map(s=>s[0] || "").join("").toUpperCase(); }
function avatarFallback(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><linearGradient id="g"><stop stop-color="#9257ff"/><stop offset="1" stop-color="#43d6ed"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#g)"/><text x="50" y="58" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="#07101e">${escapeHtml(initials(name))}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function setAvatar(img, profile) {
  img.src = profile?.avatar_url || avatarFallback(profile?.username || "FC");
  img.onerror = () => { img.onerror = null; img.src = avatarFallback(profile?.username || "FC"); };
}
function fmtTime(value) {
  try { return new Date(value).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); } catch { return ""; }
}
function showAuth() {
  $("auth-screen").classList.remove("hidden");
  $("app-screen").classList.add("hidden");
}
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app-screen").classList.remove("hidden");
}
function setAuthMode(signup) {
  state.signup = signup;
  $("login-tab").classList.toggle("active", !signup);
  $("signup-tab").classList.toggle("active", signup);
  $("username-wrap").classList.toggle("hidden", !signup);
  $("invite-wrap").classList.toggle("hidden", !signup);
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("password").minLength = signup ? 8 : 1;
  $("auth-heading").textContent = signup ? "Crear tu cuenta" : "Bienvenido a FamilyChat";
  $("auth-submit").textContent = signup ? "Crear cuenta y entrar" : "Iniciar sesión";
  status("auth-message", "");
}
async function refreshProfile() {
  const { data, error } = await supabase.from("profiles").select("id,username,avatar_path,invite_accepted").eq("id", state.user.id).maybeSingle();
  if (error) throw error;
  state.profile = data;
  if (data?.avatar_path) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(data.avatar_path, 3600);
    state.profile.avatar_url = signed?.signedUrl || null;
  }
  $("my-name").textContent = state.profile?.username || state.user.email?.split("@")[0] || "Mi perfil";
  $("my-email").textContent = state.user.email || "";
  setAvatar($("my-avatar"), state.profile);
}
async function redeemPendingInvite() {
  if (state.profile?.invite_accepted) return true;
  const pending = sessionStorage.getItem("familychat_pending_invite");
  if (!pending) return false;
  const { error } = await supabase.rpc("redeem_invite", { p_code: pending });
  if (error) { status("auth-message", "No se pudo validar la invitación. Revisa la clave y vuelve a intentarlo."); return false; }
  sessionStorage.removeItem("familychat_pending_invite");
  await refreshProfile();
  return !!state.profile?.invite_accepted;
}
async function bootUser(user) {
  if (!user) {
    state.user = null; state.profile = null; state.active = null;
    if (state.channel) { await supabase.removeChannel(state.channel); state.channel = null; }
    showAuth(); return;
  }
  state.user = user;
  try {
    await refreshProfile();
    const accepted = await redeemPendingInvite();
    if (!state.profile?.invite_accepted && !accepted) {
      showAuth();
      setAuthMode(false);
      $("invite-wrap").classList.remove("hidden");
      $("auth-heading").textContent = "Necesitas una invitación";
      $("auth-submit").textContent = "Validar clave";
      status("auth-message", "Tu cuenta está creada. Introduce la clave de invitación para activar el acceso.");
      $("email").value = user.email || "";
      return;
    }
    showApp();
    await loadProfiles();
    await loadConversations();
  } catch (e) {
    console.error(e);
    showAuth();
    status("auth-message", "No se pudo cargar tu perfil. Comprueba que ejecutaste supabase.sql en tu proyecto.");
  }
}

$("login-tab").addEventListener("click", () => setAuthMode(false));
$("signup-tab").addEventListener("click", () => setAuthMode(true));
$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = $("auth-submit"); btn.disabled = true;
  status("auth-message", state.signup ? "Creando cuenta…" : "Comprobando acceso…");
  try {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (state.signup) {
      const username = $("username").value.trim();
      const code = $("invite-code").value.trim();
      if (username.length < 2) throw new Error("El nombre debe tener al menos 2 caracteres.");
      if (!code) throw new Error("Introduce la clave de invitación.");
      sessionStorage.setItem("familychat_pending_invite", code);
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw error;
      if (data.session) {
        state.user = data.user;
        await refreshProfile();
        const ok = await redeemPendingInvite();
        if (!ok) throw new Error("No se pudo validar la invitación. Comprueba la clave.");
        await bootUser(data.user);
      } else {
        status("auth-message", "Cuenta creada. Confirma tu correo y después inicia sesión con la clave de invitación.", true);
      }
    } else if (state.user && !state.profile?.invite_accepted) {
      const code = $("invite-code").value.trim();
      if (!code) throw new Error("Introduce la clave de invitación.");
      sessionStorage.setItem("familychat_pending_invite", code);
      const ok = await redeemPendingInvite();
      if (!ok) throw new Error("Clave incorrecta o invitación no válida.");
      await bootUser(state.user);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.user = data.user;
      await refreshProfile();
      if (!state.profile?.invite_accepted) {
        const code = $("invite-code").value.trim();
        if (code) {
          sessionStorage.setItem("familychat_pending_invite", code);
          const ok = await redeemPendingInvite();
          if (!ok) throw new Error("Clave incorrecta. Inténtalo de nuevo.");
          await bootUser(data.user);
        } else {
          $("invite-wrap").classList.remove("hidden");
          status("auth-message", "Introduce la clave de invitación para activar tu cuenta.");
        }
      } else await bootUser(data.user);
    }
  } catch (e) {
    console.error(e);
    status("auth-message", e.message || "No se pudo completar la operación.");
  } finally { btn.disabled = false; }
});

async function loadProfiles() {
  const { data, error } = await supabase.from("profiles").select("id,username,avatar_path").eq("invite_accepted", true).neq("id", state.user.id).order("username");
  if (error) throw error;
  state.profiles = await Promise.all((data || []).map(async p => {
    if (p.avatar_path) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(p.avatar_path, 3600);
      p.avatar_url = signed?.signedUrl || null;
    }
    return p;
  }));
}
async function loadConversations() {
  const { data: memberships, error } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", state.user.id);
  if (error) throw error;
  const ids = (memberships || []).map(x => x.conversation_id);
  if (!ids.length) { state.conversations = []; renderConversations(); return; }
  const { data: convs, error: convError } = await supabase.from("conversations").select("id,title,type,created_by,updated_at").in("id", ids).order("updated_at", {ascending:false});
  if (convError) throw convError;
  state.conversations = await Promise.all((convs || []).map(async c => {
    const { data: members } = await supabase.from("conversation_members").select("user_id,profiles(username,avatar_path)").eq("conversation_id", c.id);
    let title = c.title || "Grupo";
    let avatar_url = null;
    if (c.type === "direct") {
      const other = (members || []).find(m => m.user_id !== state.user.id);
      title = other?.profiles?.username || "Chat privado";
      if (other?.profiles?.avatar_path) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(other.profiles.avatar_path, 3600);
        avatar_url = signed?.signedUrl;
      }
    }
    const { data: last } = await supabase.from("messages").select("content,created_at").eq("conversation_id", c.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    return {...c, display_title:title, avatar_url, last_message:last?.content || "Todavía no hay mensajes", members:members || []};
  }));
  renderConversations();
}
function renderConversations() {
  const query = $("conversation-search").value.trim().toLowerCase();
  const items = state.conversations.filter(c => c.display_title.toLowerCase().includes(query));
  $("conversation-list").innerHTML = items.length ? items.map(c => `
    <button class="conversation-item ${state.active?.id === c.id ? "active" : ""}" data-conversation="${c.id}" type="button">
      <img class="avatar" src="${c.avatar_url || avatarFallback(c.display_title)}" alt="">
      <span class="details"><strong>${escapeHtml(c.display_title)}</strong><small>${escapeHtml(c.last_message)}</small></span>
    </button>`).join("") : `<p class="muted pad">${state.conversations.length ? "No hay resultados." : "Aún no tienes chats. Crea uno para empezar."}</p>`;
  $("conversation-list").querySelectorAll("[data-conversation]").forEach(btn => btn.addEventListener("click", () => openConversation(btn.dataset.conversation)));
}
$("conversation-search").addEventListener("input", renderConversations);

async function openConversation(id) {
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;
  state.active = conv;
  $("welcome-view").classList.add("hidden");
  $("conversation-view").classList.remove("hidden");
  $("chat-title").textContent = conv.display_title;
  $("chat-subtitle").textContent = conv.type === "group" ? `${conv.members.length} participantes` : "Chat privado";
  setAvatar($("chat-avatar"), {username:conv.display_title, avatar_url:conv.avatar_url});
  renderConversations();
  await loadMessages();
  if (state.channel) await supabase.removeChannel(state.channel);
  state.channel = supabase.channel("messages-" + id)
    .on("postgres_changes", {event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${id}`}, async payload => {
      if (state.active?.id !== id) return;
      if (!state.messages.some(m => m.id === payload.new.id)) {
        state.messages.push(payload.new); renderMessages();
        state.conversations = state.conversations.map(c => c.id === id ? {...c,last_message:payload.new.content} : c);
        renderConversations();
      }
    }).subscribe();
}
async function loadMessages() {
  if (!state.active) return;
  const { data, error } = await supabase.from("messages").select("id,conversation_id,sender_id,content,created_at,profiles(username)").eq("conversation_id", state.active.id).order("created_at",{ascending:true}).limit(300);
  if (error) { status("chat-message", "No se pudieron cargar los mensajes. Comprueba las políticas de Supabase."); return; }
  state.messages = data || [];
  renderMessages();
}
function renderMessages() {
  const box = $("messages");
  box.innerHTML = state.messages.length ? state.messages.map(m => `
    <article class="bubble ${m.sender_id === state.user.id ? "mine" : ""}">
      ${m.sender_id === state.user.id ? "" : `<span class="sender">${escapeHtml(m.profiles?.username || "Usuario")}</span>`}
      ${escapeHtml(m.content)}<time>${fmtTime(m.created_at)}</time>
    </article>`).join("") : `<p class="muted">Este es el comienzo de la conversación. ¡Saluda! 👋</p>`;
  box.scrollTop = box.scrollHeight;
}
$("message-form").addEventListener("submit", async event => {
  event.preventDefault();
  const content = $("message-input").value.trim();
  if (!content || !state.active) return;
  $("send-btn").disabled = true;
  status("chat-message", "");
  const { error } = await supabase.from("messages").insert({conversation_id:state.active.id,sender_id:state.user.id,content});
  if (error) status("chat-message", "No se pudo enviar. Comprueba las políticas de mensajes.");
  else { $("message-input").value = ""; await loadMessages(); await loadConversations(); }
  $("send-btn").disabled = false;
});
$("refresh-chat-btn").addEventListener("click", loadMessages);

function renderContacts() {
  const q = $("contact-search").value.trim().toLowerCase();
  const list = state.profiles.filter(p => (p.username || "").toLowerCase().includes(q));
  $("contacts-list").innerHTML = list.length ? list.map(p => `
    <button class="contact-row" type="button" data-contact="${p.id}">
      <img class="avatar" src="${p.avatar_url || avatarFallback(p.username)}" alt="">
      <span class="grow"><strong>${escapeHtml(p.username || "Usuario")}</strong><small>Crear chat privado</small></span><span>›</span>
    </button>`).join("") : `<p class="muted">No hay contactos que coincidan. Los usuarios deben crear una cuenta y validar la invitación.</p>`;
  $("contacts-list").querySelectorAll("[data-contact]").forEach(btn => btn.addEventListener("click", () => createDirect(btn.dataset.contact)));
}
$("contact-search").addEventListener("input", renderContacts);
function openDialog(dialog) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open",""); }
function closeDialog(dialog) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
function showNewChat() { status("contacts-message",""); $("contact-search").value=""; renderContacts(); openDialog($("contacts-dialog")); }
$("new-chat-btn").addEventListener("click", showNewChat);
$("welcome-new-chat").addEventListener("click", showNewChat);

async function createDirect(otherId) {
  status("contacts-message", "Creando chat…");
  const existing = state.conversations.find(c => c.type === "direct" && c.members.some(m=>m.user_id===otherId));
  if (existing) { closeDialog($("contacts-dialog")); await openConversation(existing.id); return; }
  const { data: conv, error } = await supabase.from("conversations").insert({type:"direct",created_by:state.user.id}).select("id,type,title,created_by,updated_at").single();
  if (error) { status("contacts-message", "No se pudo crear el chat. Revisa las políticas SQL."); return; }
  const { error: memberError } = await supabase.from("conversation_members").insert([{conversation_id:conv.id,user_id:state.user.id},{conversation_id:conv.id,user_id:otherId}]);
  if (memberError) { status("contacts-message", "El chat se creó, pero no se pudieron añadir participantes. Revisa las políticas SQL."); return; }
  closeDialog($("contacts-dialog"));
  await loadConversations();
  await openConversation(conv.id);
}
$("group-search").addEventListener("input", renderGroupMembers);
function renderGroupMembers() {
  const q = $("group-search").value.trim().toLowerCase();
  const list = state.profiles.filter(p => (p.username || "").toLowerCase().includes(q));
  $("group-members").innerHTML = list.length ? list.map(p => `
    <label class="contact-row"><input type="checkbox" value="${p.id}"><img class="avatar" src="${p.avatar_url || avatarFallback(p.username)}" alt=""><span class="grow"><strong>${escapeHtml(p.username || "Usuario")}</strong><small>Invitar al grupo</small></span></label>`).join("") : `<p class="muted">No se encontraron contactos.</p>`;
}
function showGroupDialog() { $("group-name").value=""; $("group-search").value=""; status("group-message",""); renderGroupMembers(); openDialog($("group-dialog")); }
$("new-group-btn").addEventListener("click", showGroupDialog);
$("close-group").addEventListener("click", () => closeDialog($("group-dialog")));
$("group-form").addEventListener("submit", async event => {
  event.preventDefault();
  const title = $("group-name").value.trim();
  const selected = [...$("group-members").querySelectorAll('input[type="checkbox"]:checked')].map(el=>el.value);
  if (title.length < 2) { status("group-message","Escribe un nombre para el grupo."); return; }
  if (!selected.length) { status("group-message","Selecciona al menos a otra persona."); return; }
  $("create-group-btn").disabled = true;
  status("group-message","Creando grupo…");
  try {
    const { data: conv, error } = await supabase.from("conversations").insert({type:"group",title,created_by:state.user.id}).select("id,type,title,created_by,updated_at").single();
    if (error) throw error;
    const rows = [{conversation_id:conv.id,user_id:state.user.id}, ...selected.map(user_id=>({conversation_id:conv.id,user_id}))];
    const { error: memberError } = await supabase.from("conversation_members").insert(rows);
    if (memberError) throw memberError;
    closeDialog($("group-dialog"));
    await loadConversations();
    await openConversation(conv.id);
  } catch (e) {
    console.error(e); status("group-message","No se pudo crear el grupo. Comprueba las políticas SQL.");
  } finally { $("create-group-btn").disabled = false; }
});

$("profile-btn").addEventListener("click", async () => {
  $("profile-name").value = state.profile?.username || "";
  $("avatar-file").value = "";
  setAvatar($("profile-preview"), state.profile);
  status("profile-message","");
  openDialog($("profile-dialog"));
});
$("close-profile").addEventListener("click", () => closeDialog($("profile-dialog")));
$("avatar-file").addEventListener("change", () => {
  const f = $("avatar-file").files?.[0];
  if (!f) return;
  if (f.size > MAX_AVATAR_BYTES) { status("profile-message","La foto supera los 3 MB."); $("avatar-file").value=""; return; }
  if (!f.type.startsWith("image/")) { status("profile-message","Selecciona un archivo de imagen."); $("avatar-file").value=""; return; }
  $("profile-preview").src = URL.createObjectURL(f);
});
$("profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  const username = $("profile-name").value.trim();
  const file = $("avatar-file").files?.[0];
  if (username.length < 2) { status("profile-message","El nombre debe tener al menos 2 caracteres."); return; }
  status("profile-message","Guardando…");
  try {
    let avatar_path = state.profile?.avatar_path || null;
    if (file) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
      const path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type});
      if (uploadError) throw uploadError;
      avatar_path = path;
    }
    const { error } = await supabase.from("profiles").update({username,avatar_path}).eq("id",state.user.id);
    if (error) throw error;
    await refreshProfile(); await loadProfiles(); await loadConversations();
    closeDialog($("profile-dialog"));
  } catch (e) {
    console.error(e); status("profile-message","No se pudo guardar. Asegúrate de ejecutar todo el SQL de configuración.");
  }
});
$("logout-btn").addEventListener("click", async () => { await supabase.auth.signOut(); });

$("install-btn").addEventListener("click", async () => {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  $("install-btn").classList.add("hidden");
});
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault(); state.installPrompt = event; $("install-btn").classList.remove("hidden");
});
window.addEventListener("appinstalled", () => $("install-btn").classList.add("hidden"));

supabase.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(() => bootUser(session?.user || null));
});
const { data: sessionData } = await supabase.auth.getSession();
await bootUser(sessionData.session?.user || null);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(err => console.warn("No se pudo registrar el service worker:", err));
}
