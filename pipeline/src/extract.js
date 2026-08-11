import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import {
  ARTICLE_CHAR_LIMIT,
  FETCH_TIMEOUT_MS,
  MAX_HTML_BYTES,
  MIN_ARTICLE_CHARS
} from "./config.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class ExtractError extends Error {
  constructor(message) {
    super(`EXTRACT_FAILED: ${message}`);
    this.name = "ExtractError";
  }
}

async function fetchWithTimeout(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedBody(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new ExtractError("page too large");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function normalizeWhitespace(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function extractWithReadability(url) {
  const response = await fetchWithTimeout(url, "text/html,application/xhtml+xml");
  if (!response.ok) {
    throw new ExtractError(`fetch returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    throw new ExtractError(`not an HTML page (${contentType || "unknown type"})`);
  }

  const html = await readBoundedBody(response);
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  const text = normalizeWhitespace(article?.textContent || "");
  if (text.length < MIN_ARTICLE_CHARS) {
    throw new ExtractError("could not extract enough readable text");
  }

  return {
    title: (article.title || "").trim(),
    text,
    siteName: (article.siteName || "").trim(),
    byline: (article.byline || "").trim()
  };
}

// Fallback for SPAs and other pages Readability cannot handle: Jina's free
// reader endpoint renders the page and returns plain text/markdown.
async function extractWithJinaReader(url) {
  const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, "text/plain");
  if (!response.ok) {
    throw new ExtractError(`fallback reader returned HTTP ${response.status}`);
  }

  const body = await readBoundedBody(response);
  const titleMatch = body.match(/^Title:\s*(.+)$/m);
  const text = normalizeWhitespace(
    body.replace(/^(Title|URL Source|Published Time|Markdown Content):.*$/gm, "")
  );

  if (text.length < MIN_ARTICLE_CHARS) {
    throw new ExtractError("could not extract enough readable text");
  }

  return {
    title: (titleMatch?.[1] || "").trim(),
    text,
    siteName: "",
    byline: ""
  };
}

export async function extractArticle(url) {
  let result;
  try {
    result = await extractWithReadability(url);
  } catch (primaryError) {
    try {
      result = await extractWithJinaReader(url);
    } catch {
      throw primaryError instanceof ExtractError
        ? primaryError
        : new ExtractError(primaryError.message);
    }
  }

  if (result.text.length > ARTICLE_CHAR_LIMIT) {
    result.text = result.text.slice(0, ARTICLE_CHAR_LIMIT);
  }
  return result;
}
