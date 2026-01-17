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
  const { data: { user } } = await client.auth.getUser();
  return user;
}

async function login(email, password) {
  return await client.auth.signInWithPassword({ email, password });
}

async function signup(email, password) {
  return await client.auth.signUp({ email, password });
}

async function logout() {
  await client.auth.signOut();
  showPage("loginPage");
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

async function saveProfile(updates) {
  const user = await getUser();
  if (!user) return;

  await client
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
}

/* ============================================================
   CHAT HELPERS
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
  const user = await getUser();

  const { error } = await client.from("messages").insert({
    room_code: room,
    user_id: user.id,
    username,
    content
  });

  if (error) {
    alert("Message error: " + error.message);
  }
}

/* ============================================================
   RENDER MESSAGE BUBBLES
   ============================================================ */
function renderMessage(msg, currentUserId) {
  const div = document.createElement("div");
  div.className = msg.user_id === currentUserId ? "bubble me" : "bubble";

  div.innerHTML = `
    <div class="username">${msg.username}</div>
    <div class="text">${msg.content}</div>
  `;

  return div;
}

/* ============================================================
   ROOM STARTER
   ============================================================ */
async function startRoom(room, profile) {
  const user = await getUser();
  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  document.getElementById("roomTitle").textContent = "Room " + room;

  joinRoom(room, (msg) => {
    messagesDiv.appendChild(renderMessage(msg, user.id));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  document.getElementById("sendBtn").onclick = async () => {
    const content = document.getElementById("messageInput").value.trim();
    if (!content) return;

    await sendMessage(room, profile.username, content);
    document.getElementById("messageInput").value = "";
  };
}

/* ============================================================
   PAGE SWITCHING
   ============================================================ */
function showPage(id) {
  document.querySelectorAll("section.page").forEach(sec => {
    sec.style.display = "none";
  });
  document.getElementById(id).style.display = "flex";
}

/* ============================================================
   PAGE INITIALIZERS
   ============================================================ */
function initLogin() {
  document.getElementById("loginBtn").onclick = async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;

    const { error } = await login(email, password);
    if (error) return alert(error.message);

    showPage("profilePage");
    initProfile();
  };
}

function initSignup() {
  document.getElementById("signupBtn").onclick = async () => {
    const email = signupEmail.value;
    const password = signupPassword.value;

    const { error } = await signup(email, password);
    if (error) return alert(error.message);

    showPage("profilePage");
    initProfile();
  };
}

async function initProfile() {
  const user = await getUser();
  if (!user) return showPage("loginPage");

  const profile = await loadProfile();

  profileUsername.value = profile?.username || "";
  profileBio.value = profile?.bio || "";

  saveProfileBtn.onclick = async () => {
    await saveProfile({
      username: profileUsername.value,
      bio: profileBio.value
    });
    alert("Profile saved");
  };
}

async function initChat() {
  const user = await getUser();
  if (!user) return showPage("loginPage");

  const profile = await loadProfile();

  joinRoomBtn.onclick = () => {
    const code = joinRoomInput.value.trim();
    if (!code) return alert("Enter a room code");
    startRoom(code, profile);
  };

  createRoomBtn.onclick = () => {
    const code = generateRoomCode();
    startRoom(code, profile);
  };
}

/* ============================================================
   APP STARTUP
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const user = await getUser();

  if (user) {
    showPage("profilePage");
    initProfile();
  } else {
    showPage("loginPage");
    initLogin();
    initSignup();
  }
});