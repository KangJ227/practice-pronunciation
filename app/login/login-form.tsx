"use client";

import { useState, type FormEvent } from "react";

export function LoginForm({
  denied,
  next,
}: {
  denied: boolean;
  next: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          next,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Could not sign in.");
      }

      setStatus("sent");
      window.location.assign(next || "/");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {denied ? (
        <div className="rounded-2xl border border-berry/20 bg-berry/10 px-4 py-3 text-sm font-semibold text-berry">
          This account is not allowed for this private app.
        </div>
      ) : null}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
          Username
        </span>
        <input
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base text-ink outline-none ring-berry/20 transition focus:ring-4"
          placeholder="username"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
          Password
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base text-ink outline-none ring-berry/20 transition focus:ring-4"
          placeholder="password"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-full bg-berry px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-berry/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "Signing in..." : "Sign in"}
      </button>
      {message ? (
        <p
          className={`text-sm font-medium ${
            status === "error" ? "text-berry" : "text-moss"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
