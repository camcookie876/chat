import { client } from "./supabase.js";

export function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function joinRoom(code, onMessage) {
  // Load old messages
  const { data } = await client
    .from("messages")
    .select("*")
    .eq("room_code", code)
    .order("created_at", { ascending: true });

  data.forEach(onMessage);

  // Realtime subscription
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

  localStorage.setItem("lastRoom", code);
}

export async function sendMessage(room, username, content) {
  await client.from("messages").insert({
    room_code: room,
    username,
    content
  });
}