import { createHash } from "node:crypto";

// Reads the saved links exactly the way the web app does: through Firestore's
// public REST API, scoped by the hashed sync key. No service account needed.
const FIRESTORE_REST_BASE =
  process.env.FIRESTORE_REST_BASE || "https://firestore.googleapis.com/v1";

export function hashSyncKey(syncKey) {
  return createHash("sha256").update(syncKey).digest("hex");
}

export async function fetchLinks({ projectId, apiKey, syncKeyHash }) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(
      `${FIRESTORE_REST_BASE}/projects/${projectId}/databases/(default)/documents`
      + `/reading_lists/${syncKeyHash}/urls`
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Firestore list failed: HTTP ${response.status}`);
    }
    const body = await response.json();
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return documents
    .map((doc) => ({
      urlId: doc.name.split("/").pop(),
      url: doc.fields?.url?.stringValue || "",
      format: doc.fields?.format?.stringValue === "deep" ? "deep" : "tldr",
      createdAtMs: Date.parse(doc.fields?.createdAt?.timestampValue || "") || 0
    }))
    .filter((link) => link.url);
}
