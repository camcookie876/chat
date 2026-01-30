/* ============================================================
   SUPABASE CLIENT
   ============================================================ */
const client = supabase.createClient(
  "https://bafcfszceittoberpgdz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhZmNmc3pjZWl0dG9iZXJwZ2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NjcwNjYsImV4cCI6MjA4NDI0MzA2Nn0.-JLfGymc77W3pIxMimhXZ3G21ATU25yOfPPvGNirmQU"
);

/* ============================================================
   AUTH HELPERS
   ============================================================ */
async function getUser() {
  const { data } = await client.auth.getUser();
  return data.user;
}

async function login(email, password) {
  return await client.auth.signInWithPassword({ email, password });
}

async function signup(email, password) {
  return await client.auth.signUp({ email, password });
}

async function logout() {
  await client.auth.signOut();
  location.reload();
}

/* ============================================================
   PROFILE HELPERS (existing profiles table)
   ============================================================ */
async function loadProfile() {
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("loadProfile error", error);
    return null;
  }

  return data;
}

async function ensureProfile() {
  const user = await getUser();
  if (!user) return null;

  let profile = await loadProfile();
  if (!profile) {
    const username = user.email?.split("@")[0] || "user" + Math.floor(Math.random() * 100000);
    const { data, error } = await client
      .from("profiles")
      .insert({ id: user.id, username, bio: "" })
      .select("*")
      .single();
    if (error) {
      console.error("ensureProfile insert error", error);
      return null;
    }
    profile = data;
  }
  return profile;
}

async function saveProfile(updates) {
  const user = await getUser();
  if (!user) return;

  const { error } = await client
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    alert("Error saving profile: " + error.message);
  }
}

/* ============================================================
   ROUTING
   ============================================================ */
const PAGES = ["#connect", "#chat", "#post", "#settings"];

function parseLocation() {
  const hash = location.hash || "#connect";
  const params = new URLSearchParams(location.search);
  return { hash, params };
}

function showPage(hash) {
  if (!PAGES.includes(hash)) hash = "#connect";

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  const idMap = {
    "#connect": "connectPage",
    "#chat": "chatPage",
    "#post": "postPage",
    "#settings": "settingsPage"
  };
  const id = idMap[hash];
  const pageEl = document.getElementById(id);
  if (pageEl) pageEl.classList.add("active");

  document.querySelectorAll("#topbar .nav button[data-nav]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.nav === hash);
  });

  if (hash === "#connect") {
    initConnectPage();
  } else if (hash === "#chat") {
    initChatPageFromLocation();
  } else if (hash === "#post") {
    loadFeed();
  } else if (hash === "#settings") {
    initSettingsPage();
  }
}

window.addEventListener("hashchange", () => {
  const { hash } = parseLocation();
  showPage(hash);
});

window.addEventListener("popstate", () => {
  const { hash } = parseLocation();
  showPage(hash);
});

/* NAV BUTTONS */
function initNavButtons() {
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      const url = new URL(location.href);
      url.hash = target;
      url.search = "";
      history.pushState({}, "", url.toString());
      showPage(target);
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", logout);
}

/* ============================================================
   AUTH UI
   ============================================================ */
function initAuthUI() {
  const overlay = document.getElementById("authOverlay");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.classList.add("active");
    signupForm.classList.remove("active");
  });

  signupTab.addEventListener("click", () => {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.classList.add("active");
    loginForm.classList.remove("active");
  });

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    if (!email || !password) return alert("Enter email and password");

    const { error } = await login(email, password);
    if (error) return alert(error.message);

    await ensureProfile();
    overlay.style.display = "none";
    const { hash } = parseLocation();
    showPage(hash);
    initConnectPage();
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value.trim();
    if (!email || !password) return alert("Enter email and password");

    const { error } = await signup(email, password);
    if (error) return alert(error.message);

    await ensureProfile();
    overlay.style.display = "none";
    const { hash } = parseLocation();
    showPage(hash);
    initConnectPage();
  });
}

/* ============================================================
   CONNECT PAGE
   ============================================================ */
async function initConnectPage() {
  const user = await getUser();
  if (!user) return;

  const profile = await ensureProfile();
  const username = profile?.username || user.email || "Camcookie User";

  document.getElementById("connectUsername").textContent = username;

  const initials = (username || "CC")
    .split(" ")
    .map(p => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  document.getElementById("connectAvatar").textContent = initials;
}

/* ============================================================
   CHAT (new schema)
   ============================================================ */
let currentChatId = null;
let currentChatChannel = null;

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function loadChats() {
  const user = await getUser();
  if (!user) return [];

  const { data, error } = await client
    .from("chat_members")
    .select("chat_id, chats (id, title, invite_code, created_at)")
    .eq("user_id", user.id)
    .order("chats(created_at)", { ascending: false });

  if (error) {
    console.error("loadChats error", error);
    return [];
  }

  return (data || []).map(row => row.chats);
}

async function createChat() {
  const user = await getUser();
  if (!user) return;

  const title = prompt("Chat name:");
  if (!title) return;

  const invite_code = generateInviteCode();

  const { data: chat, error } = await client
    .from("chats")
    .insert({
      owner_id: user.id,
      title,
      invite_code,
      is_group: true
    })
    .select("*")
    .single();

  if (error) {
    alert("Error creating chat: " + error.message);
    return;
  }

  const { error: memberError } = await client
    .from("chat_members")
    .insert({
      chat_id: chat.id,
      user_id: user.id,
      role: "owner"
    });

  if (memberError) {
    alert("Error adding you to chat: " + memberError.message);
    return;
  }

  await renderChatList();
  await openChat(chat.id);
}

async function joinChatByInvite(code) {
  const user = await getUser();
  if (!user) return;

  const { data: chat, error } = await client
    .from("chats")
    .select("*")
    .eq("invite_code", code.toUpperCase())
    .maybeSingle();

  if (error || !chat) {
    alert("Chat not found for that invite code.");
    return;
  }

  const { data: existing } = await client
    .from("chat_members")
    .select("*")
    .eq("chat_id", chat.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memberError } = await client
      .from("chat_members")
      .insert({
        chat_id: chat.id,
        user_id: user.id,
        role: "member"
      });

    if (memberError) {
      alert("Error joining chat: " + memberError.message);
      return;
    }
  }

  await renderChatList();
  await openChat(chat.id);
}

async function loadMessages(chatId) {
  const { data, error } = await client
    .from("messages")
    .select("*, profiles!messages_user_id_fkey(username)")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadMessages error", error);
    return [];
  }

  return data;
}

async function sendMessage(chatId, content) {
  const user = await getUser();
  if (!user) return;

  const { error } = await client
    .from("messages")
    .insert({
      chat_id: chatId,
      user_id: user.id,
      content
    });

  if (error) {
    alert("Message error: " + error.message);
  }
}

function renderMessageBubble(msg, currentUserId) {
  const div = document.createElement("div");
  div.className = "bubble" + (msg.user_id === currentUserId ? " me" : "");

  const username = msg.profiles?.username || "User";
  const time = new Date(msg.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  div.innerHTML = `
    <div class="username">${username}</div>
    <div class="text">${escapeHtml(msg.content)}</div>
    <div class="meta">${time}</div>
  `;

  return div;
}

async function openChat(chatId) {
  const user = await getUser();
  if (!user) return;

  currentChatId = chatId;

  const { data: chat, error } = await client
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .single();

  if (error) {
    console.error("openChat chat error", error);
    return;
  }

  document.getElementById("chatTitle").textContent = chat.title;
  document.getElementById("chatSubtitle").textContent = "Invite friends with this code:";
  document.getElementById("chatInviteCode").textContent = chat.invite_code || "";

  document.querySelectorAll(".chat-item").forEach(el => {
    el.classList.toggle("active", el.dataset.chatId === chatId);
  });

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  const messages = await loadMessages(chatId);
  messages.forEach(m => {
    messagesDiv.appendChild(renderMessageBubble(m, user.id));
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if (currentChatChannel) {
    client.removeChannel(currentChatChannel);
    currentChatChannel = null;
  }

  currentChatChannel = client
    .channel("chat-" + chatId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "chat_id=eq." + chatId },
      async payload => {
        const msg = payload.new;
        const { data: profile } = await client
          .from("profiles")
          .select("username")
          .eq("id", msg.user_id)
          .maybeSingle();
        const enriched = { ...msg, profiles: { username: profile?.username || "User" } };
        messagesDiv.appendChild(renderMessageBubble(enriched, user.id));
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    )
    .subscribe();
}

async function renderChatList() {
  const chatList = document.getElementById("chatList");
  chatList.innerHTML = "";

  const chats = await loadChats();
  if (!chats.length) {
    chatList.innerHTML = `<p style="font-size:13px;color:#4a5a8a;">No chats yet. Create one or join with an invite code.</p>`;
    return;
  }

  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "chat-item";
    item.dataset.chatId = chat.id;
    item.innerHTML = `
      <div class="chat-item-title">${escapeHtml(chat.title)}</div>
      <div class="chat-item-meta">${new Date(chat.created_at).toLocaleString()}</div>
    `;
    item.addEventListener("click", () => {
      const url = new URL(location.href);
      url.hash = "#chat";
      url.search = "?chat=" + chat.id;
      history.pushState({}, "", url.toString());
      showPage("#chat");
      openChat(chat.id);
    });
    chatList.appendChild(item);
  });
}

function initChatPageFromLocation() {
  renderChatList();
  const { params } = parseLocation();
  const chatId = params.get("chat");
  if (chatId) {
    openChat(chatId);
  }
}

function initChatUI() {
  document.getElementById("createChatBtn").addEventListener("click", createChat);

  document.getElementById("joinInviteBtn").addEventListener("click", () => {
    const code = document.getElementById("joinInviteInput").value.trim();
    if (!code) return alert("Enter an invite code");
    joinChatByInvite(code);
  });

  document.getElementById("sendBtn").addEventListener("click", async () => {
    const input = document.getElementById("messageInput");
    const content = input.value.trim();
    if (!content || !currentChatId) return;
    await sendMessage(currentChatId, content);
    input.value = "";
  });

  document.getElementById("messageInput").addEventListener("keydown", async e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const content = e.target.value.trim();
      if (!content || !currentChatId) return;
      await sendMessage(currentChatId, content);
      e.target.value = "";
    }
  });
}

/* ============================================================
   POSTS (feed)
   ============================================================ */
async function createPost(content, imageUrl) {
  const user = await getUser();
  if (!user) return;

  const { error } = await client
    .from("posts")
    .insert({
      user_id: user.id,
      content,
      image_url: imageUrl || null
    });

  if (error) {
    alert("Error creating post: " + error.message);
  }
}

async function loadFeed() {
  const { data, error } = await client
    .from("posts")
    .select("*, profiles!posts_user_id_fkey(username)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadFeed error", error);
    return;
  }

  const feedList = document.getElementById("feedList");
  feedList.innerHTML = "";

  if (!data.length) {
    feedList.innerHTML = `<p style="font-size:13px;color:#4a5a8a;">No posts yet. Be the first to post!</p>`;
    return;
  }

  data.forEach(post => {
    const card = document.createElement("div");
    card.className = "post-card";

    const username = post.profiles?.username || "User";
    const time = new Date(post.created_at).toLocaleString();

    card.innerHTML = `
      <div class="post-header">
        <span class="post-author">${escapeHtml(username)}</span>
        <span class="post-time">${time}</span>
      </div>
      <div class="post-content">${escapeHtml(post.content)}</div>
      ${post.image_url ? `<img class="post-image" src="${post.image_url}" alt="">` : ""}
      <div class="post-actions">Likes and comments coming soon.</div>
    `;

    feedList.appendChild(card);
  });
}

function initPostUI() {
  document.getElementById("postSubmitBtn").addEventListener("click", async () => {
    const contentEl = document.getElementById("postContent");
    const imageEl = document.getElementById("postImageUrl");
    const content = contentEl.value.trim();
    const imageUrl = imageEl.value.trim();

    if (!content) return alert("Write something first.");

    await createPost(content, imageUrl);
    contentEl.value = "";
    imageEl.value = "";
    await loadFeed();
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
async function initSettingsPage() {
  const profile = await ensureProfile();
  if (!profile) return;

  document.getElementById("settingsUsername").value = profile.username || "";
  document.getElementById("settingsBio").value = profile.bio || "";
}

function initSettingsUI() {
  document.getElementById("saveProfileBtn").addEventListener("click", async () => {
    const username = document.getElementById("settingsUsername").value.trim();
    const bio = document.getElementById("settingsBio").value.trim();

    if (!username) return alert("Username cannot be empty.");

    await saveProfile({ username, bio });
    alert("Profile saved.");
    initConnectPage();
  });
}

/* ============================================================
   UTIL
   ============================================================ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ============================================================
   APP STARTUP
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  initNavButtons();
  initAuthUI();
  initChatUI();
  initPostUI();
  initSettingsUI();

  const user = await getUser();
  const overlay = document.getElementById("authOverlay");

  if (!user) {
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
    await ensureProfile();
    const { hash } = parseLocation();
    showPage(hash);
    initConnectPage();
  }
});
