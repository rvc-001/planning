"use client"

import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

// --- Types and Interfaces ---
interface User {
  id: string
  username: string
  role: string
  permissions: string[]
}

interface Page {
  pageid: string;
  pagename: string;
}

interface GvizRow {
  c: ({ v: any; f?: string; } | null)[]
}

interface AuthContextType {
  user: User | null
  allUsers: User[]
  roles: string[]
  pages: Page[]
  isAuthLoading: boolean
  isSubmitting: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  addUser: (userData: Omit<User, 'id'> & { password?: string }) => Promise<{ success: boolean; error?: string }>
  updateUser: (userData: Partial<User> & { id: string; password?: string }) => Promise<{ success: boolean; error?: string }>
  deleteUser: (userId: string) => Promise<{ success: boolean; error?: string }>
  refreshData: () => void
}

// --- Constants ---
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const LOGIN_SHEET_NAME = "Login_v2"

// --- Hardcoded App Data (Removes Master Sheet Dependency) ---
const ROLES_AVAILABLE = ["admin", "user"];
const PAGES_AVAILABLE = [
    { pageid: "", pagename: "Dashboard" },
    { pageid: "orders", pagename: "Orders" },
    { pageid: "full-kitting", pagename: "Full Kitting" },
    { pageid: "job-cards", pagename: "Job Cards" },
    { pageid: "production", pagename: "Production" },
    { pageid: "lab-testing1", pagename: "Lab Test 1" },
    { pageid: "lab-testing2", pagename: "Lab Test 2" },
    { pageid: "chemical-test", pagename: "Chemical Test" },
    { pageid: "check", pagename: "Check" },
    { pageid: "tally", pagename: "Tally" },
    { pageid: "settings", pagename: "Settings" },
];


// --- Auth Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// --- Auth Provider Component ---
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const fetchUsers = useCallback(async () => {
    setIsAuthLoading(true);
    try {
      const loginUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(LOGIN_SHEET_NAME)}&headers=1&cb=${new Date().getTime()}`
      const response = await fetch(loginUrl);
      if (!response.ok) throw new Error("Failed to fetch user list");

      const loginText = await response.text();
      const loginMatch = loginText.match(/google\.visualization\.Query\.setResponse\((.*)\)/);
      if (loginMatch && loginMatch[1]) {
        const loginJson = JSON.parse(loginMatch[1]);
        const users = loginJson.table.rows
          .map((row: GvizRow) => ({
            username: row.c[0]?.v,
            id: row.c[1]?.v,
            role: row.c[3]?.v,
            permissions: row.c[4]?.v ? row.c[4].toString().split(',') : []
          }))
          .filter((user: User) => user.id && user.username);
        setAllUsers(users);
      }

      const storedUser = sessionStorage.getItem("user")
      if (storedUser) {
        setUser(JSON.parse(storedUser))
      }

    } catch (error) {
      console.error("Failed to fetch initial app data:", error);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const login = async (username: string, password: string) => {
    setIsSubmitting(true)
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(LOGIN_SHEET_NAME)}&headers=0&cb=${new Date().getTime()}`
      const response = await fetch(url)
      if (!response.ok) throw new Error("Login failed: Could not connect to user database.");
      
      const text = await response.text();
      const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\)/);
      if (!match || !match[1]) throw new Error("Could not parse login response.");
      const json = JSON.parse(match[1]);
      if (!json.table || !json.table.rows) throw new Error("Login data is invalid.")

      let foundUser: User | null = null;
      for (let i = 1; i < json.table.rows.length; i++) {
        const row = json.table.rows[i];
        const rowUsername = row.c[0]?.v;
        const rowId = row.c[1]?.v;
        const rowPassword = row.c[2]?.v;
        const rowRole = row.c[3]?.v;
        const rowPermissions = row.c[4]?.v;

        if (rowUsername?.toString().toLowerCase() === username.toLowerCase() && rowPassword?.toString() === password) {
          foundUser = { username: rowUsername, id: rowId, role: rowRole, permissions: rowPermissions ? rowPermissions.toString().split(',') : [] };
          break;
        }
      }

      if (foundUser) {
        setUser(foundUser);
        sessionStorage.setItem("user", JSON.stringify(foundUser));
        router.push("/");
        return { success: true };
      } else {
        return { success: false, error: "Invalid username or password." };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false)
    }
  }

  const addUser = async (userData: Omit<User, 'id'> & { password?: string }) => {
    const body = new URLSearchParams({ action: 'addUser', userData: JSON.stringify(userData) });
    const response = await fetch(WEB_APP_URL, { method: 'POST', body });
    const result = await response.json();
    if(result.success) fetchUsers(); // Refresh data on success
    return result;
  }

  const updateUser = async (userData: Partial<User> & { id: string; password?: string }) => {
    const body = new URLSearchParams({ action: 'updateUser', userData: JSON.stringify(userData) });
    const response = await fetch(WEB_APP_URL, { method: 'POST', body });
    const result = await response.json();
    if(result.success) fetchUsers();
    return result;
  }

  const deleteUser = async (userId: string) => {
    const body = new URLSearchParams({ action: 'deleteUser', userId });
    const response = await fetch(WEB_APP_URL, { method: 'POST', body });
    const result = await response.json();
    if(result.success) fetchUsers();
    return result;
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem("user")
    router.push("/login")
  }

  const value = useMemo(
    () => ({
      user,
      allUsers,
      roles: ROLES_AVAILABLE,
      pages: PAGES_AVAILABLE,
      isAuthLoading,
      isSubmitting,
      login,
      logout,
      addUser,
      updateUser,
      deleteUser,
      refreshData: fetchUsers,
    }),
    [user, allUsers, isAuthLoading, isSubmitting, fetchUsers],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// --- Custom Hook for easy context access ---
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

// --- App-wide Loading Component ---
export const FullPageLoader = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-background">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
)