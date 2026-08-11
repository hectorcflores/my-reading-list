import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { MAX_ATTEMPTS, PROCESSING_LEASE_MS } from "./config.js";

let db = null;

export function getDb() {
  if (!db) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
    }
    initializeApp({ credential: cert(JSON.parse(raw)) });
    db = getFirestore();
  }
  return db;
}

function isStaleProcessing(episode) {
  const startedAt = episode.processingStartedAt;
  if (!startedAt || typeof startedAt.toMillis !== "function") return true;
  return Date.now() - startedAt.toMillis() > PROCESSING_LEASE_MS;
}

function needsEpisode(episode) {
  if (!episode) return true;
  if (episode.status === "failed") return (episode.attempts || 0) < MAX_ATTEMPTS;
  if (episode.status === "processing") return isStaleProcessing(episode);
  return false;
}

// Unfiltered collection-group query: needs no index, and catches docs saved
// before this feature existed (they have no `episode` field at all).
export async function listCandidates() {
  const snapshot = await getDb().collectionGroup("urls").get();

  return snapshot.docs
    .filter((doc) => needsEpisode(doc.data().episode))
    .map((doc) => {
      const data = doc.data();
      return {
        ref: doc.ref,
        docPath: doc.ref.path,
        urlId: doc.ref.id,
        syncKeyHash: doc.ref.parent.parent.id,
        url: data.url,
        format: data.format === "deep" ? "deep" : "tldr",
        createdAtMs: data.createdAt?.toMillis?.() || 0,
        attempts: data.episode?.attempts || 0
      };
    })
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export async function markProcessing(ref) {
  await ref.update({
    "episode.status": "processing",
    "episode.processingStartedAt": Timestamp.now(),
    "episode.updatedAt": Timestamp.now()
  });
}

export async function markFailed(ref, message, attempts) {
  await ref.update({
    "episode.status": "failed",
    "episode.error": message,
    "episode.attempts": attempts,
    "episode.processingStartedAt": FieldValue.delete(),
    "episode.updatedAt": Timestamp.now()
  });
}

export async function markReady(docPath, meta) {
  await getDb().doc(docPath).update({
    episode: {
      status: "ready",
      title: meta.title,
      audioPath: meta.audioPath,
      durationSec: meta.durationSec,
      sizeBytes: meta.sizeBytes,
      voice: meta.voice,
      model: meta.model,
      updatedAt: Timestamp.now()
    }
  });
}
