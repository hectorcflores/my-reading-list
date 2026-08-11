import { readFile, writeFile } from "node:fs/promises";
import { MAX_ATTEMPTS } from "./config.js";

// Episode status lives in app/episodes.json, committed alongside the MP3s.
// The app fetches it from GitHub Pages; no database writes are needed.

export async function loadEpisodes(episodesJsonPath) {
  try {
    return JSON.parse(await readFile(episodesJsonPath, "utf8")) || {};
  } catch {
    return {};
  }
}

export async function saveEpisodes(episodesJsonPath, episodes) {
  await writeFile(episodesJsonPath, `${JSON.stringify(episodes, null, 2)}\n`);
}

export function needsEpisode(entry) {
  if (!entry) return true;
  if (entry.status === "failed") return (entry.attempts || 0) < MAX_ATTEMPTS;
  return false;
}
