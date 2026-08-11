import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPISODES_PER_RUN, TTS_MODEL, TTS_VOICE } from "./config.js";
import { extractArticle } from "./extract.js";
import { listCandidates, markFailed, markProcessing, markReady } from "./firestore.js";
import { writeScript } from "./script.js";
import { probeDuration, synthesizeEpisode } from "./tts.js";

const pipelineDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(pipelineDir);
const outDir = path.join(pipelineDir, ".out");
const resultsPath = path.join(outDir, "results.json");
const episodesDir = path.join(repoRoot, "app", "episodes");

function audioPathFor(candidate) {
  return `episodes/${candidate.syncKeyHash.slice(0, 12)}/${candidate.urlId}.mp3`;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generate() {
  const candidates = (await listCandidates()).slice(0, EPISODES_PER_RUN);
  console.log(`Found ${candidates.length} link(s) needing episodes.`);

  const results = [];
  for (const candidate of candidates) {
    const audioPath = audioPathFor(candidate);
    const absoluteAudioPath = path.join(repoRoot, "app", audioPath);

    try {
      // Crash recovery: a previous run may have generated and pushed the MP3
      // but died before finalizing Firestore. Don't regenerate — re-finalize.
      if (await fileExists(absoluteAudioPath)) {
        console.log(`Audio already exists for ${candidate.url}; will re-finalize.`);
        results.push(await recoveredResult(candidate, audioPath, absoluteAudioPath));
        continue;
      }

      console.log(`Processing (${candidate.format}): ${candidate.url}`);
      await markProcessing(candidate.ref);

      const article = await extractArticle(candidate.url);
      const { title, script } = await writeScript(article, candidate.format);
      const { durationSec, sizeBytes } = await synthesizeEpisode(
        script,
        absoluteAudioPath,
        outDir
      );

      results.push({ docPath: candidate.docPath, status: "ready", title, audioPath, durationSec, sizeBytes });
      console.log(`Generated ${audioPath} (${durationSec}s, ${sizeBytes} bytes).`);
    } catch (error) {
      const message = String(error.message || error).slice(0, 500);
      console.error(`Failed for ${candidate.url}: ${message}`);
      try {
        await markFailed(candidate.ref, message, candidate.attempts + 1);
      } catch (updateError) {
        console.error(`Could not record failure: ${updateError.message}`);
      }
    }
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} result(s) to ${resultsPath}.`);
}

async function recoveredResult(candidate, audioPath, absoluteAudioPath) {
  // A previous run generated this MP3 but died before finalizing. Re-extracting
  // just for the title is wasteful; reuse one from the interrupted run if any.
  const snapshot = await candidate.ref.get();
  const existingTitle = snapshot.data()?.episode?.title;
  const [durationSec, fileStat] = await Promise.all([
    probeDuration(absoluteAudioPath),
    stat(absoluteAudioPath)
  ]);
  return {
    docPath: candidate.docPath,
    status: "ready",
    title: existingTitle || candidate.url,
    audioPath,
    durationSec,
    sizeBytes: fileStat.size
  };
}

async function finalize() {
  let results;
  try {
    results = JSON.parse(await readFile(resultsPath, "utf8"));
  } catch {
    console.log("No results file; nothing to finalize.");
    return;
  }

  for (const result of results) {
    if (result.status !== "ready") continue;
    await markReady(result.docPath, {
      title: result.title,
      audioPath: result.audioPath,
      durationSec: result.durationSec,
      sizeBytes: result.sizeBytes,
      voice: TTS_VOICE,
      model: TTS_MODEL
    });
    console.log(`Marked ready: ${result.docPath}`);
  }
}

const command = process.argv[2];
if (command === "generate") {
  await generate();
} else if (command === "finalize") {
  await finalize();
} else {
  console.error("Usage: node src/index.js <generate|finalize>");
  process.exitCode = 1;
}
