import api from "./api";

export async function registerUser(payload) {
  const response = await api.post("/api/auth/register", payload);
  return response.data;
}

export async function loginUser(payload) {
  const response = await api.post("/api/auth/login", payload);
  return response.data;
}

export async function fetchProfile() {
  const response = await api.get("/api/auth/profile");
  return response.data?.user;
}

export async function updateProfile(payload) {
  const response = await api.patch("/api/auth/profile", payload);
  return response.data?.user;
}

export async function fetchUsers() {
  const response = await api.get("/api/auth/users");
  return response.data?.items || [];
}
