/* ============================================================
   SUPABASE CLIENT
   ============================================================ */
const client = supabase.createClient(
  "https://YOUR-PROJECT.supabase.co",
  "YOUR-PUBLIC-ANON-KEY"
);

/* ============================================================
   AUTH HELPERS
   ============================================================ */
async function getUser() {
  const { data: { user } } = await client.auth.getUser();
  return user;
}

async function loginWithEmail(email, password) {
  return await client.auth.signInWithPassword({ email, password });
}

async function signupWithEmail(email, password) {
  return await client.auth.signUp({ email, password });
}

async function logout() {
  await client.auth.signOut();
  window.location.href = "/chat/login/";
}

/* ============================================================
   PROFILE HELPERS
   ============================================================ */
async function loadProfile() {
  const user = await getUser();
  if (!user) return null;

  const { data } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

async function updateProfile(updates) {
  const user = await getUser();
  if (!user) return;

  await client
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
}

/* ============================================================
   CHAT ROOM HELPERS
   ============================================================ */
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function joinRoom(code, onMessage) {
  const { data } = await client
    .from("messages")
    .select("*")
    .eq("room_code", code)
    .order("created_at", { ascending: true });

  data.forEach(onMessage);

  client
    .channel("room-" + code)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        if (payload.new.room_code === code) onMessage(payload.new);
      }
    )
    .subscribe();
}

async function sendMessage(room, username, content) {
  await client.from("messages").insert({
    room_code: room,
    username,
    content
  });
}

/* ============================================================
   PAGE ROUTER (auto-detect which page we are on)
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const path = window.location.pathname;

  if (path.endsWith("/login/") || path.endsWith("/login/index.html")) {
    initLoginPage();
  }

  if (path.endsWith("/signup/") || path.endsWith("/signup/index.html")) {
    initSignupPage();
  }

  if (path.endsWith("/profile/") || path.endsWith("/profile/index.html")) {
    initProfilePage();
  }

  if (path.endsWith("/chats/") || path.endsWith("/chats/index.html")) {
    initChatsPage();
  }
});

/* ============================================================
   PAGE: LOGIN
   ============================================================ */
function initLoginPage() {
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const btn = document.getElementById("loginBtn");

  btn.onclick = async () => {
    const { error } = await loginWithEmail(email.value, password.value);
    if (!error) window.location.href = "/chat/profile/";
  };
}

/* ============================================================
   PAGE: SIGNUP
   ============================================================ */
function initSignupPage() {
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const btn = document.getElementById("signupBtn");

  btn.onclick = async () => {
    const { error } = await signupWithEmail(email.value, password.value);
    if (!error) window.location.href = "/chat/profile/";
  };
}

/* ============================================================
   PAGE: PROFILE
   ============================================================ */
async function initProfilePage() {
  const user = await getUser();
  if (!user) return (window.location.href = "/chat/login/");

  const profile = await loadProfile();

  document.getElementById("username").value = profile.username || "";
  document.getElementById("bio").value = profile.bio || "";

  document.getElementById("saveBtn").onclick = async () => {
    await updateProfile({
      username: document.getElementById("username").value,
      bio: document.getElementById("bio").value
    });
    alert("Profile saved");
  };

  document.getElementById("logoutBtn").onclick = logout;
}

/* ============================================================
   PAGE: CHATS
   ============================================================ */
async function initChatsPage() {
  const user = await getUser();
  if (!user) return (window.location.href = "/chat/login/");

  const roomTitle = document.getElementById("roomTitle");
  const messagesDiv = document.getElementById("messages");
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");

  let currentRoom = generateRoomCode();
  roomTitle.textContent = "Room " + currentRoom;

  joinRoom(currentRoom, (msg) => {
    const div = document.createElement("div");
    div.textContent = msg.username + ": " + msg.content;
    messagesDiv.appendChild(div);
  });

  sendBtn.onclick = async () => {
    const content = messageInput.value.trim();
    if (!content) return;

    const profile = await loadProfile();
    await sendMessage(currentRoom, profile.username, content);

    messageInput.value = "";
  };
}