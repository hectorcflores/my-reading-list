import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPISODES_PER_RUN, TTS_MODEL, TTS_VOICE } from "./config.js";
import { loadEpisodes, needsEpisode, saveEpisodes } from "./episodes.js";
import { extractArticle } from "./extract.js";
import { fetchLinks, hashSyncKey } from "./links.js";
import { writeScript } from "./script.js";
import { probeDuration, synthesizeEpisode } from "./tts.js";

const pipelineDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(pipelineDir);
const outDir = path.join(pipelineDir, ".out");
const episodesJsonPath = path.join(repoRoot, "app", "episodes.json");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is not set`);
  return value;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const syncKeyHash = process.env.SYNC_KEY_HASH || hashSyncKey(requireEnv("SYNC_KEY"));
  const links = await fetchLinks({
    projectId: requireEnv("FIREBASE_PROJECT_ID"),
    apiKey: requireEnv("FIREBASE_API_KEY"),
    syncKeyHash
  });

  const episodes = await loadEpisodes(episodesJsonPath);
  const candidates = links
    .filter((link) => needsEpisode(episodes[link.urlId]))
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .slice(0, EPISODES_PER_RUN);

  console.log(`${links.length} link(s) total, ${candidates.length} needing episodes this run.`);

  for (const link of candidates) {
    const audioPath = `episodes/${syncKeyHash.slice(0, 12)}/${link.urlId}.mp3`;
    const absoluteAudioPath = path.join(repoRoot, "app", audioPath);
    const previousAttempts = episodes[link.urlId]?.attempts || 0;

    try {
      let title;
      let audioMeta;

      if (await fileExists(absoluteAudioPath)) {
        // A previous run generated this MP3 but crashed before recording it.
        console.log(`Audio already exists for ${link.url}; recording as ready.`);
        title = episodes[link.urlId]?.title || link.url;
        audioMeta = {
          durationSec: await probeDuration(absoluteAudioPath),
          sizeBytes: (await stat(absoluteAudioPath)).size
        };
      } else {
        console.log(`Processing (${link.format}): ${link.url}`);
        const article = await extractArticle(link.url);
        const generated = await writeScript(article, link.format);
        title = generated.title;
        audioMeta = await synthesizeEpisode(generated.script, absoluteAudioPath, outDir);
      }

      episodes[link.urlId] = {
        status: "ready",
        title,
        audioPath,
        durationSec: audioMeta.durationSec,
        sizeBytes: audioMeta.sizeBytes,
        format: link.format,
        voice: TTS_VOICE,
        model: TTS_MODEL,
        updatedAt: new Date().toISOString()
      };
      console.log(`Generated ${audioPath} (${audioMeta.durationSec}s).`);
    } catch (error) {
      const message = String(error.message || error).slice(0, 500);
      console.error(`Failed for ${link.url}: ${message}`);
      episodes[link.urlId] = {
        status: "failed",
        error: message,
        attempts: previousAttempts + 1,
        format: link.format,
        updatedAt: new Date().toISOString()
      };
    }

    // Save after every link so a crash mid-run loses at most one episode.
    await saveEpisodes(episodesJsonPath, episodes);
  }
}

await run();
