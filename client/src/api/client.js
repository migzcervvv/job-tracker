import axios from "axios";
import { AUTH_STORAGE_KEY } from "../auth/constants.js";
import { notify } from "../notify.js";
import { resolveApiBaseUrl } from "./config.js";

export const api = axios.create({
  baseURL: resolveApiBaseUrl(
    import.meta.env.VITE_API_URL,
    import.meta.env.PROD,
  ),
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (raw) {
    try {
      const { token } = JSON.parse(raw);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (typeof res.data === "string" && /<!doctype|<html/i.test(res.data)) {
      const error = new Error("The backend request returned a website page.");
      error.code = "API_RETURNED_HTML";
      throw error;
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401) {
      const wasSignedIn = Boolean(localStorage.getItem(AUTH_STORAGE_KEY));
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (window.location.pathname !== "/login") {
        if (wasSignedIn)
          notify.error("Session expired", "Sign in again to continue.");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);
