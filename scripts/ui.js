export function loadLastRoom() {
  return localStorage.getItem("lastRoom");
}

export function saveLastRoom(code) {
  localStorage.setItem("lastRoom", code);
}

export function loadUsername() {
  return localStorage.getItem("username") || "";
}

export function saveUsername(name) {
  localStorage.setItem("username", name);
}