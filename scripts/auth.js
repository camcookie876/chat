// scripts/auth.js
import { client } from "./supabase.js";

/* -----------------------------
   LOGIN WITH SUPABASE OAUTH
   (GitHub, Discord, Google, etc.)
--------------------------------*/
export async function loginWithProvider(provider) {
  await client.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: "https://camcookie876.github.io/chat/goath/"
    }
  });
}

/* -----------------------------
   EMAIL + PASSWORD LOGIN
--------------------------------*/
export async function loginWithEmail(email, password) {
  const { error } = await client.auth.signInWithPassword({
    email,
    password
  });

  return error;
}

/* -----------------------------
   EMAIL SIGNUP
--------------------------------*/
export async function signupWithEmail(email, password) {
  const { error } = await client.auth.signUp({
    email,
    password
  });

  return error;
}

/* -----------------------------
   MAGIC LINK LOGIN
--------------------------------*/
export async function loginWithMagicLink(email) {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: "https://camcookie876.github.io/chat/goath/"
    }
  });

  return error;
}

/* -----------------------------
   GET CURRENT USER
--------------------------------*/
export async function getUser() {
  const { data: { user } } = await client.auth.getUser();
  return user;
}

/* -----------------------------
   LOGOUT
--------------------------------*/
export async function logout() {
  await client.auth.signOut();
  window.location.reload();
}