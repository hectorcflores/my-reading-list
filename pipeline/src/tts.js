import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import {
  AUDIO_BITRATE,
  TTS_CHUNK_CHAR_LIMIT,
  TTS_INSTRUCTIONS,
  TTS_MODEL,
  TTS_VOICE
} from "./config.js";

const execFileAsync = promisify(execFile);

let client = null;

function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

// Split on paragraph boundaries so any chunk seams land on natural pauses.
export function chunkScript(script) {
  const paragraphs = script.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > TTS_CHUNK_CHAR_LIMIT && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function synthesizeChunk(text, outputPath) {
  const response = await getClient().audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    instructions: TTS_INSTRUCTIONS,
    response_format: "mp3"
  });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

export async function probeDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    filePath
  ]);
  return Math.round(Number(JSON.parse(stdout).format.duration) || 0);
}

export async function synthesizeEpisode(script, outputPath, workDir) {
  const chunkDir = path.join(workDir, "chunks");
  await rm(chunkDir, { recursive: true, force: true });
  await mkdir(chunkDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  const chunks = chunkScript(script);
  const chunkPaths = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkPath = path.join(chunkDir, `${String(i).padStart(3, "0")}.mp3`);
    await synthesizeChunk(chunks[i], chunkPath);
    chunkPaths.push(chunkPath);
  }

  const joinedPath = path.join(chunkDir, "joined.mp3");
  if (chunkPaths.length === 1) {
    await execFileAsync("ffmpeg", ["-y", "-i", chunkPaths[0], "-c", "copy", joinedPath]);
  } else {
    const listPath = path.join(chunkDir, "list.txt");
    await writeFile(
      listPath,
      chunkPaths.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join("\n")
    );
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      joinedPath
    ]);
  }

  // One re-encode to mono at a modest bitrate keeps repo size small.
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", joinedPath,
    "-ac", "1",
    "-b:a", AUDIO_BITRATE,
    outputPath
  ]);

  const [durationSec, fileStat] = await Promise.all([
    probeDuration(outputPath),
    stat(outputPath)
  ]);
  await rm(chunkDir, { recursive: true, force: true });

  return { durationSec, sizeBytes: fileStat.size };
}
