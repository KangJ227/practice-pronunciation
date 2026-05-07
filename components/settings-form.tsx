"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/types";

export function SettingsForm({ initialSettings }: { initialSettings: UserSettings }) {
  const [ttsVoice, setTtsVoice] = useState(initialSettings.ttsVoice);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttsVoice }),
      });
      const payload = (await response.json()) as {
        error?: string;
        settings?: UserSettings;
      };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || "Failed to save settings.");
      }

      setTtsVoice(payload.settings.ttsVoice);
      setMessage("Settings saved. Regenerate TTS on a material to apply this voice to existing audio.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[30px] border border-black/10 bg-white/88 p-5 shadow-card md:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
          Reference Voice
        </p>
        <h2 className="mt-2 font-display text-3xl text-ink">Azure TTS voice</h2>
      </div>

      <label className="mt-6 grid gap-2 text-sm font-semibold text-ink/75">
        Voice name
        <input
          value={ttsVoice}
          onChange={(event) => setTtsVoice(event.target.value)}
          placeholder="fr-FR-DeniseNeural"
          className="rounded-2xl border border-black/10 bg-paper/70 px-4 py-3 text-base font-normal text-ink outline-none transition focus:border-brass/70"
        />
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <a
          href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts"
          target="_blank"
          className="text-sm font-semibold text-berry underline decoration-berry/30 underline-offset-4"
        >
          Azure voice list
        </a>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl bg-paper/75 px-4 py-3 text-sm leading-6 text-ink/75">
          {message}
        </p>
      ) : null}
    </div>
  );
}
