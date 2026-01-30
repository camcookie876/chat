// app.js – Camcookie Connect 26
// Chat + Facebook‑style feed (profiles, friends, posts, comments, likes)

const SUPABASE_URL = "https://bafcfszceittoberpgdz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhZmNmc3pjZWl0dG9iZXJwZ2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NjcwNjYsImV4cCI6MjA4NDI0MzA2Nn0.-JLfGymc77W3pIxMimhXZ3G21ATU25yOfPPvGNirmQU";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   AUTH
   ============================================================ */

async function getUser() {
  const { data } = await client.auth.getUser();
  return data.user;
}

async function requireUser() {
  const user = await getUser();
  if (!user) {
    showAuthOverlay(true);
    return null;
  }
  return user;
}

function showAuthOverlay(show) {
  document.getElementById("authOverlay").style.display = show ? "flex" : "none";
}

async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  if (!email || !password) return;

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    alert(error.message);
    return;
  }
  await onAuthChanged();
}

async function handleSignup() {
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value.trim();
  if (!email || !password) return;

  const { error } = await client.auth.signUp({ email, password });
  if (error) {
    alert(error.message);
    return;
  }
  alert("Check your email to confirm your account.");
}

async function handleLogout() {
  await client.auth.signOut();
  location.reload();
}

/* ============================================================
   PROFILES
   ============================================================ */

async function loadProfile(userId) {
  const { data } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

async function ensureProfile() {
  const user = await getUser();
  if (!user) return null;

  let profile = await loadProfile(user.id);
  if (!profile) {
    const username = user.email.split("@")[0];
    const { data, error } = await client
      .from("profiles")
      .insert({ id: user.id, username, bio: "" })
      .select("*")
      .single();
    if (error) {
      console.error(error);
      return null;
    }
    profile = data;
  }
  return profile;
}

async function saveProfile() {
  const user = await getUser();
  if (!user) return;

  const username = document.getElementById("settingsUsername").value.trim();
  const bio = document.getElementById("settingsBio").value.trim();

  const { error } = await client
    .from("profiles")
    .update({ username, bio })
    .eq("id", user.id);

  if (error) {
    alert(error.message);
    return;
  }
  alert("Profile saved.");
  initConnectPage();
}

/* ============================================================
   ROUTING
   ============================================================ */

const PAGE_IDS = {
  "#connect": "connectPage",
  "#chat": "chatPage",
  "#post": "postPage",
  "#settings": "settingsPage"
};

function parseLocation() {
  const hash = location.hash || "#connect";
  const params = new URLSearchParams(location.search);
  return { hash, params };
}

function showPage(hash) {
  if (!PAGE_IDS[hash]) hash = "#connect";

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(PAGE_IDS[hash]).classList.add("active");

  if (hash === "#connect") initConnectPage();
  if (hash === "#chat") initChatPageFromLocation();
  if (hash === "#post") initPostPage();
  if (hash === "#settings") initSettingsPage();
}

/* ============================================================
   CONNECT PAGE
   ============================================================ */

async function initConnectPage() {
  const profile = await ensureProfile();
  if (!profile) return;

  const username = profile.username || "User";
  document.getElementById("connectUsername").textContent = username;
  document.getElementById("connectAvatar").textContent =
    username.slice(0, 2).toUpperCase();
}

/* ============================================================
   CHAT (ROOMS + MESSAGES)
   ============================================================ */

let currentChatId = null;
let currentChatChannel = null;

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function loadUserChats() {
  const user = await getUser();
  if (!user) return [];

  const { data, error } = await client
    .from("chat_members")
    .select("chat_id, chats(id, title, invite_code, created_at)")
    .eq("user_id", user.id);

  if (error) {
    console.error(error);
    return [];
  }
  return data.map(r => r.chats);
}

async function renderChatList() {
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  const chats = await loadUserChats();
  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "chat-item";
    item.dataset.chatId = chat.id;
    item.innerHTML = `
      <div class="chat-item-title">${chat.title}</div>
      <div class="chat-item-meta">${new Date(chat.created_at).toLocaleString()}</div>
    `;
    item.onclick = () => {
      const url = new URL(location.href);
      url.hash = "#chat";
      url.search = "?chat=" + chat.id;
      history.pushState({}, "", url.toString());
      showPage("#chat");
      openChat(chat.id);
    };
    list.appendChild(item);
  });
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
      invite_code
    })
    .select("*")
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  await client.from("chat_members").insert({
    chat_id: chat.id,
    user_id: user.id,
    role: "owner"
  });

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

  if (error) {
    alert(error.message);
    return;
  }
  if (!chat) {
    alert("Chat not found.");
    return;
  }

  await client.from("chat_members").upsert({
    chat_id: chat.id,
    user_id: user.id,
    role: "member"
  });

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
    console.error(error);
    return [];
  }
  return data;
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
    <div class="text">${msg.content}</div>
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

  if (error || !chat) {
    alert("Chat not found.");
    return;
  }

  document.getElementById("chatTitle").textContent = chat.title;
  document.getElementById("chatInviteCode").textContent = chat.invite_code;

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  const messages = await loadMessages(chatId);
  messages.forEach(m => messagesDiv.appendChild(renderMessageBubble(m, user.id)));
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if (currentChatChannel) client.removeChannel(currentChatChannel);

  currentChatChannel = client
    .channel("chat-" + chatId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "chat_id=eq." + chatId
      },
      async payload => {
        const msg = payload.new;

        const { data: profile } = await client
          .from("profiles")
          .select("username")
          .eq("id", msg.user_id)
          .maybeSingle();

        msg.profiles = { username: profile?.username || "User" };

        messagesDiv.appendChild(renderMessageBubble(msg, user.id));
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    )
    .subscribe();
}

async function sendMessage(chatId, content) {
  const user = await getUser();
  if (!user) return;

  const { error } = await client.from("messages").insert({
    chat_id: chatId,
    user_id: user.id,
    content
  });

  if (error) console.error(error);
}

function initChatUI() {
  document.getElementById("createChatBtn").onclick = createChat;

  document.getElementById("joinInviteBtn").onclick = () => {
    const code = document.getElementById("joinInviteInput").value.trim();
    if (code) joinChatByInvite(code);
  };

  document.getElementById("sendBtn").onclick = async () => {
    const input = document.getElementById("messageInput");
    const content = input.value.trim();
    if (content && currentChatId) {
      await sendMessage(currentChatId, content);
      input.value = "";
    }
  };

  document.getElementById("messageInput").addEventListener("keydown", async e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const content = e.target.value.trim();
      if (content && currentChatId) {
        await sendMessage(currentChatId, content);
        e.target.value = "";
      }
    }
  });
}

function initChatPageFromLocation() {
  renderChatList();
  const { params } = parseLocation();
  const chatId = params.get("chat");
  if (chatId) openChat(chatId);
}

/* ============================================================
   FRIENDS
   ============================================================ */

async function loadFriends() {
  const user = await getUser();
  if (!user) return { friends: [], requests: [] };

  const { data: rows, error } = await client
    .from("friends")
    .select("*")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

  if (error) {
    console.error(error);
    return { friends: [], requests: [] };
  }

  const friends = [];
  const requests = [];

  for (const row of rows) {
    const isSelfSender = row.user_id === user.id;
    const otherId = isSelfSender ? row.friend_id : row.user_id;

    const profile = await loadProfile(otherId);
    const entry = { row, profile };

    if (row.status === "accepted") {
      friends.push(entry);
    } else if (row.status === "pending" && !isSelfSender) {
      requests.push(entry);
    }
  }

  return { friends, requests };
}

async function sendFriendRequestByUsername(username) {
  const user = await getUser();
  if (!user) return;

  const { data: target, error } = await client
    .from("profiles")
    .select("*")
    .ilike("username", username)
    .maybeSingle();

  if (error) {
    alert(error.message);
    return;
  }
  if (!target) {
    alert("User not found.");
    return;
  }
  if (target.id === user.id) {
    alert("You cannot friend yourself.");
    return;
  }

  const { error: insertError } = await client.from("friends").upsert({
    user_id: user.id,
    friend_id: target.id,
    status: "pending"
  });

  if (insertError) {
    alert(insertError.message);
    return;
  }
  alert("Friend request sent.");
  renderFriendsUI();
}

async function respondToFriendRequest(row, accept) {
  const { error } = await client
    .from("friends")
    .update({ status: accept ? "accepted" : "blocked" })
    .eq("user_id", row.user_id)
    .eq("friend_id", row.friend_id);

  if (error) {
    alert(error.message);
    return;
  }
  renderFriendsUI();
}

async function renderFriendsUI() {
  const { friends, requests } = await loadFriends();

  const friendsList = document.getElementById("friendsList");
  const requestsList = document.getElementById("friendRequestsList");

  if (!friendsList || !requestsList) return;

  friendsList.innerHTML = "";
  requestsList.innerHTML = "";

  friends.forEach(({ profile }) => {
    const li = document.createElement("div");
    li.className = "friend-item";
    li.textContent = profile.username;
    friendsList.appendChild(li);
  });

  requests.forEach(({ row, profile }) => {
    const li = document.createElement("div");
    li.className = "friend-item";
    li.innerHTML = `
      <span>${profile.username}</span>
      <div class="friend-actions">
        <button class="accept">Accept</button>
        <button class="decline">Decline</button>
      </div>
    `;
    li.querySelector(".accept").onclick = () => respondToFriendRequest(row, true);
    li.querySelector(".decline").onclick = () => respondToFriendRequest(row, false);
    requestsList.appendChild(li);
  });
}

function initFriendsUI() {
  const addBtn = document.getElementById("addFriendBtn");
  const input = document.getElementById("addFriendInput");
  if (!addBtn || !input) return;

  addBtn.onclick = () => {
    const username = input.value.trim();
    if (username) sendFriendRequestByUsername(username);
  };

  renderFriendsUI();
}

/* ============================================================
   POSTS / FEED / COMMENTS / LIKES
   ============================================================ */

async function createPost(content, imageUrl) {
  const user = await getUser();
  if (!user) return;

  const { error } = await client.from("posts").insert({
    user_id: user.id,
    content,
    image_url: imageUrl || null
  });

  if (error) {
    alert(error.message);
  }
}

async function toggleLike(postId) {
  const user = await getUser();
  if (!user) return;

  const { data: existing } = await client
    .from("post_likes")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await client
      .from("post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
  } else {
    await client.from("post_likes").insert({
      post_id: postId,
      user_id: user.id
    });
  }

  loadFeed();
}

async function addComment(postId, content) {
  const user = await getUser();
  if (!user) return;

  const { error } = await client.from("comments").insert({
    post_id: postId,
    user_id: user.id,
    content
  });

  if (error) {
    alert(error.message);
    return;
  }
  loadFeed();
}

async function loadFeed() {
  const user = await getUser();
  if (!user) return;

  const { data: posts, error } = await client
    .from("posts")
    .select("*, profiles!posts_user_id_fkey(username)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const feed = document.getElementById("feedList");
  feed.innerHTML = "";

  for (const post of posts) {
    const { data: likes } = await client
      .from("post_likes")
      .select("*")
      .eq("post_id", post.id);

    const { data: comments } = await client
      .from("comments")
      .select("*, profiles!comments_user_id_fkey(username)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    const likedByUser = likes?.some(l => l.user_id === user.id);
    const likeCount = likes?.length || 0;

    const card = document.createElement("div");
    card.className = "post-card";

    const username = post.profiles?.username || "User";
    const time = new Date(post.created_at).toLocaleString();

    const commentsHtml =
      comments
        ?.map(
          c => `
        <div class="comment">
          <span class="comment-author">${c.profiles?.username || "User"}</span>
          <span class="comment-text">${c.content}</span>
        </div>
      `
        )
        .join("") || "";

    card.innerHTML = `
      <div class="post-header">
        <span class="post-author">${username}</span>
        <span class="post-time">${time}</span>
      </div>
      <div class="post-content">${post.content}</div>
      ${post.image_url ? `<img class="post-image" src="${post.image_url}">` : ""}
      <div class="post-actions">
        <button class="like-btn">${likedByUser ? "Unlike" : "Like"} (${likeCount})</button>
      </div>
      <div class="comments">
        ${commentsHtml}
      </div>
      <div class="comment-input">
        <input type="text" placeholder="Write a comment...">
        <button>Comment</button>
      </div>
    `;

    const likeBtn = card.querySelector(".like-btn");
    likeBtn.onclick = () => toggleLike(post.id);

    const commentInput = card.querySelector(".comment-input input");
    const commentBtn = card.querySelector(".comment-input button");
    commentBtn.onclick = () => {
      const text = commentInput.value.trim();
      if (text) {
        addComment(post.id, text);
        commentInput.value = "";
      }
    };

    feed.appendChild(card);
  }
}

function initPostUI() {
  const submitBtn = document.getElementById("postSubmitBtn");
  const contentEl = document.getElementById("postContent");
  const imageEl = document.getElementById("postImageUrl");

  submitBtn.onclick = async () => {
    const content = contentEl.value.trim();
    const imageUrl = imageEl.value.trim();
    if (!content) return;
    await createPost(content, imageUrl);
    contentEl.value = "";
    imageEl.value = "";
    loadFeed();
  };
}

function initPostPage() {
  loadFeed();
}

/* ============================================================
   SETTINGS PAGE
   ============================================================ */

async function initSettingsPage() {
  const profile = await ensureProfile();
  if (!profile) return;

  document.getElementById("settingsUsername").value = profile.username || "";
  document.getElementById("settingsBio").value = profile.bio || "";
}

/* ============================================================
   INIT
   ============================================================ */

async function onAuthChanged() {
  const user = await getUser();
  if (!user) {
    showAuthOverlay(true);
    return;
  }

  showAuthOverlay(false);
  await ensureProfile();
  initConnectPage();
  renderFriendsUI();
  showPage(parseLocation().hash);
}

function initAuthUI() {
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  loginTab.onclick = () => {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.classList.add("active");
    signupForm.classList.remove("active");
  };

  signupTab.onclick = () => {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.classList.add("active");
    loginForm.classList.remove("active");
  };

  document.getElementById("loginBtn").onclick = handleLogin;
  document.getElementById("signupBtn").onclick = handleSignup;
  document.getElementById("logoutBtn").onclick = handleLogout;
}

function initNav() {
  document.querySelectorAll("button[data-nav]").forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute("data-nav");
      const url = new URL(location.href);
      url.hash = target;
      url.search = "";
      history.pushState({}, "", url.toString());
      showPage(target);
    }
  });
}

window.addEventListener("hashchange", () => {
  const { hash } = parseLocation();
  showPage(hash);
});

window.addEventListener("load", async () => {
  initAuthUI();
  initNav();
  initChatUI();
  initPostUI();
  initFriendsUI();

  await onAuthChanged();
});