import OpenAI from "openai";
import { FORMATS, SCRIPT_MODEL } from "./config.js";

const SYSTEM_PROMPT =
  "You write scripts for a single-narrator podcast where a warm, knowledgeable "
  + "host explains one article to a smart friend. Conversational spoken English. "
  + "No markdown, no headings, no stage directions, no 'welcome back' filler. "
  + "Spell out numbers, expand acronyms on first use, and read URLs or handles "
  + "naturally. Open with one sentence naming the article and its source; close "
  + "with the single most important takeaway. Return JSON: "
  + '{"title": "clean article title", "script": "..."}';

let client = null;

function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

export async function writeScript(article, format) {
  const formatSpec = FORMATS[format] || FORMATS.tldr;

  const sourceLine = [article.siteName, article.byline].filter(Boolean).join(", ");
  const userPrompt = [
    formatSpec.prompt,
    "",
    `Article title: ${article.title || "(unknown)"}`,
    sourceLine ? `Source: ${sourceLine}` : "",
    "",
    "Article text:",
    article.text
  ].filter((line) => line !== "").join("\n");

  const completion = await getClient().chat.completions.create({
    model: SCRIPT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ]
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  const script = (parsed.script || "").trim();
  if (!script) {
    throw new Error("script generation returned an empty script");
  }

  return {
    title: (parsed.title || "").trim() || article.title || "Untitled article",
    script
  };
}
