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
  await client.from("messages").insert({
    room_code: room,
    username,
    content
  });
}

/* ============================================================
   ROOM STARTER
   ============================================================ */
function startRoom(room, profile) {
  document.getElementById("roomTitle").textContent = "Room " + room;

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  joinRoom(room, (msg) => {
    const div = document.createElement("div");
    div.className = "message";
    div.textContent = msg.username + ": " + msg.content;
    messagesDiv.appendChild(div);
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
  document.getElementById(id).style.display = "block";
}

/* ============================================================
   PAGE INITIALIZERS
   ============================================================ */
function initLogin() {
  document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const { error } = await login(email, password);
    if (error) return alert(error.message);

    showPage("profilePage");
    initProfile();
  };
}

function initSignup() {
  document.getElementById("signupBtn").onclick = async () => {
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;

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

  document.getElementById("profileUsername").value = profile?.username || "";
  document.getElementById("profileBio").value = profile?.bio || "";

  document.getElementById("saveProfileBtn").onclick = async () => {
    await saveProfile({
      username: document.getElementById("profileUsername").value,
      bio: document.getElementById("profileBio").value
    });
    alert("Profile saved");
  };
}

async function initChat() {
  const user = await getUser();
  if (!user) return showPage("loginPage");

  const profile = await loadProfile();

  document.getElementById("joinRoomBtn").onclick = () => {
    const code = document.getElementById("joinRoomInput").value.trim();
    if (!code) return alert("Enter a room code");
    startRoom(code, profile);
  };

  document.getElementById("createRoomBtn").onclick = () => {
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