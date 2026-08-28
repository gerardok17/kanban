"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

const credentials = { username: "user", password: "password" };
const authEvent = "kanban-auth-change";

const subscribeToAuth = (onChange: () => void) => {
  window.addEventListener(authEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(authEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
};

const getAuthState = () => window.localStorage.getItem("kanban-auth") === "signed-in";
const getServerAuthState = () => false;

export const AuthGate = () => {
  const isSignedIn = useSyncExternalStore(
    subscribeToAuth,
    getAuthState,
    getServerAuthState
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usesBackendSession = () =>
    window.location.port === "8000" || window.location.port === "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (username !== credentials.username || password !== credentials.password) {
      setError("Invalid username or password.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (usesBackendSession()) {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
          setError("Unable to sign in right now.");
          return;
        }
      }
      window.localStorage.setItem("kanban-auth", "signed-in");
      window.dispatchEvent(new Event(authEvent));
    } catch {
      setError("Unable to sign in right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (usesBackendSession()) {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Sign out locally regardless; the backend session cookie expires on its own.
      }
    }
    window.localStorage.removeItem("kanban-auth");
    window.dispatchEvent(new Event(authEvent));
    setUsername("");
    setPassword("");
  };

  if (isSignedIn) {
    return <KanbanBoard onLogout={handleLogout} remote={usesBackendSession()} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project workspace
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          Sign in to open your Kanban board.
        </p>
        <div className="mt-8 space-y-4">
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--navy-dark)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              autoComplete="current-password"
              required
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
};