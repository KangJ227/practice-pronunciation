const read = (...names: string[]) =>
  names.map((name) => process.env[name]?.trim() ?? "").find(Boolean) ?? "";

export const appConfig = {
  locale: read("DEFAULT_LOCALE") || "fr-FR",
  speechVoice: read("AZURE_SPEECH_VOICE") || "fr-FR-DeniseNeural",
  azureSpeechKey: read("AZURE_SPEECH_KEY"),
  azureSpeechRegion: read("AZURE_SPEECH_REGION"),
  kimiApiKey: read("KIMI_API_KEY", "MOONSHOT_API_KEY"),
  kimiBaseUrl: read("KIMI_BASE_URL", "MOONSHOT_BASE_URL") || "https://api.moonshot.cn/v1",
  kimiModel: read("KIMI_MODEL") || "kimi-k2.5",
  maxAudioMinutes: Number(read("MAX_AUDIO_MINUTES") || 10),
  maxAttemptSeconds: Number(read("MAX_ATTEMPT_SECONDS") || 20),
};

export const isAzureSpeechConfigured = () =>
  Boolean(appConfig.azureSpeechKey && appConfig.azureSpeechRegion);

export const isKimiConfigured = () => Boolean(appConfig.kimiApiKey);
