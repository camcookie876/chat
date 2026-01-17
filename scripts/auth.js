// scripts/auth.js
import { client } from "./supabase.js";

export async function loginWithGitHub() {
  await client.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: "https://camcookie876.github.io/chat/goath/"
    }
  });
}

export async function getUser() {
  const { data: { user } } = await client.auth.getUser();
  return user;
}