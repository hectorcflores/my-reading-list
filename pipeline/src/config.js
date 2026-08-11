export const SCRIPT_MODEL = "gpt-4o-mini";
export const TTS_MODEL = "gpt-4o-mini-tts";
export const TTS_VOICE = "ash";
export const TTS_INSTRUCTIONS =
  "Warm, engaged podcast host. Natural conversational pace, friendly and clear, "
  + "subtle enthusiasm; brief pauses between ideas.";

export const AUDIO_BITRATE = "48k";

// Keep each TTS request comfortably under the model's ~2,000-token input limit.
export const TTS_CHUNK_CHAR_LIMIT = 3500;

// Bound LLM input cost for very long articles (~6k tokens).
export const ARTICLE_CHAR_LIMIT = 24000;
export const MIN_ARTICLE_CHARS = 500;

export const FETCH_TIMEOUT_MS = 20000;
export const MAX_HTML_BYTES = 3 * 1024 * 1024;

export const MAX_ATTEMPTS = 3;
export const EPISODES_PER_RUN = 5;

export const FORMATS = {
  tldr: {
    label: "TLDR",
    prompt:
      "Write a 300-430 word script (about 2-3 minutes spoken). Cover: what the "
      + "article says, why it matters, and one concrete detail worth remembering."
  },
  deep: {
    label: "Deep dive",
    prompt:
      "Write a 1,300-1,750 word script (about 9-12 minutes spoken), in flowing "
      + "paragraphs separated by blank lines. Walk through the article's argument "
      + "in order, explain any background a general listener needs, include the "
      + "strongest evidence and any counterpoints, and end with the implications."
  }
};

export const DEFAULT_FORMAT = "tldr";
