import { createContext, useContext, useEffect, useState } from "react";
import { loginRequest } from "./authService.js";
import { AUTH_STORAGE_KEY } from "./constants.js";
const AuthContext = createContext(null);
function storedUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === AUTH_STORAGE_KEY) setUser(storedUser());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  async function login(email, password) {
    const result = await loginRequest(email, password);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result));
    setUser(result);
    return result;
  }
  function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  }
  function updateUser(patch) {
    setUser((previous) => {
      const next = { ...previous, ...patch };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading: false,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === "admin",
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider required");
  return context;
}
