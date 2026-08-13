import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const FETCH_TIMEOUT_MS = 8000;
const MAX_DESCRIPTION_CHARS = 140;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function initFirestore() {
  const serviceAccount = JSON.parse(requireEnv("FIREBASE_SERVICE_ACCOUNT"));
  initializeApp({ credential: cert(serviceAccount) });
  return getFirestore();
}

async function fetchPageMeta(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; ReadingListBot/1.0)" }
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const metaDescription = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    )?.[1]?.trim();

    if (!title && !metaDescription) return null;
    return { title, metaDescription };
  } catch (error) {
    console.warn(`Fetch failed for ${url}: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateDescription(url, meta) {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const context = meta
    ? `Page title: ${meta.title || "(none)"}\nMeta description: ${meta.metaDescription || "(none)"}`
    : "(the page could not be fetched, infer from the URL only)";

  const prompt = `You write short, plain-language one-line descriptions for a personal reading list.
URL: ${url}
${context}

Write a single-line description (max 100 characters) of what this page/article is about. No quotes, no trailing period, no preamble like "This page is about" — just the description itself.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 60, temperature: 0.2 }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");

  return text.trim().replace(/^["']|["']$/g, "").slice(0, MAX_DESCRIPTION_CHARS);
}

async function main() {
  const db = initFirestore();
  const snapshot = await db.collectionGroup("urls").get();
  const pending = snapshot.docs.filter((doc) => !doc.data().description);

  console.log(`${snapshot.size} total links, ${pending.length} missing a description.`);

  for (const doc of pending) {
    const { url } = doc.data();
    try {
      const meta = await fetchPageMeta(url);
      const description = await generateDescription(url, meta);
      await doc.ref.update({ description });
      console.log(`OK  ${url} -> ${description}`);
    } catch (error) {
      console.warn(`SKIP ${url}: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
