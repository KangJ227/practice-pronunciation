"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export function LoginForm({
  allowedEmail,
  denied,
  next,
}: {
  allowedEmail: string;
  denied: boolean;
  next: string;
}) {
  const [email, setEmail] = useState(allowedEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next || "/");
    return callback.toString();
  }, [next]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      if (!allowedEmail) {
        throw new Error("ALLOWED_LOGIN_EMAIL is not configured.");
      }

      if (allowedEmail && email.trim().toLowerCase() !== allowedEmail) {
        throw new Error("This email is not allowed to use this app.");
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        throw error;
      }

      setStatus("sent");
      setMessage("Magic link sent. Open it from your email to continue.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not send login link.");
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
          Email
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base text-ink outline-none ring-berry/20 transition focus:ring-4"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-full bg-berry px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-berry/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "Sending..." : "Send magic link"}
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
