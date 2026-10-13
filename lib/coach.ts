import type { Review, Tip, TipKind } from "../types";

type Json = null | boolean | number | string | Json[] | JsonObject;

type JsonObject = { [key: string]: Json };

const MIN_WORDS = 8;

const MAX_PROSE_CHARS = 3000;

const MAX_TIPS = 3;

const WHY_CHARS = 100;

const KINDS: readonly TipKind[] = ["grammar", "word", "pronunciation", "clarity"];

export const SYSTEM = `You are an English coach for a software engineer whose first language is Spanish. They often dictate prompts by voice, and a speech-to-text tool writes what it heard. You see one prompt they just sent to a coding assistant.

Find at most three issues that matter most, in this order:
1. grammar errors;
2. wrong or invented words, and calques from Spanish ("a determined situation" -> "a given situation", "make a research" -> "do some research");
3. words the dictation likely misheard: a wrong word that sounds like the right one. This hints at how they pronounced it. Say which word they likely meant and how to stress it;
4. phrasing that is unclear, rambling or not professional.

Ignore: code, file paths, identifiers, product and tool names, ticket keys, filler words that dictation adds, missing or odd punctuation, capitalization, and a casual tone that is fine in chat.

Keep each tip short so it reads at a glance:
- "said" is the smallest part that is wrong, two to five words, never the whole sentence;
- "better" replaces only that part;
- "why" is one simple sentence under 80 characters, in plain words a learner knows, with no grammar terms.

Also write "rewrite": the whole prompt rewritten in clear, natural, professional English that keeps every request, detail and name they gave. Keep code, paths and names exactly as written.

Reply with one JSON object and nothing else:
{"tips": [{"kind": "grammar" | "word" | "pronunciation" | "clarity", "said": "<their exact words, two to five>", "better": "<the corrected words>", "why": "<one plain sentence, under 80 characters, addressed to them as you>"}], "rewrite": "<the whole prompt rewritten>"}
or, when the English is already good:
{"tips": [], "rewrite": ""}`;

export function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .trim()
    .slice(0, MAX_PROSE_CHARS);
}

export function isWorthReview(text: string): boolean {
  if (text.trimStart().startsWith("/")) return false;

  return prose(text).split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}

export function parse(reply: string): Review | undefined {
  const source = /\{[\s\S]*\}/.exec(reply)?.[0];

  if (source === undefined) return undefined;

  let value: Json;

  try {
    value = JSON.parse(source);
  } catch {
    return undefined;
  }

  if (!isJsonObject(value) || !Array.isArray(value.tips)) return undefined;

  const tips = value.tips.flatMap(toTip).slice(0, MAX_TIPS);

  if (tips.length === 0) return undefined;

  const rewrite = isString(value.rewrite) ? value.rewrite.trim() : "";

  return { tips, rewrite };
}

function toTip(value: Json): Tip[] {
  if (!isJsonObject(value)) return [];

  const { kind, said, better, why } = value;

  if (!isString(said) || !isString(better) || !isString(why)) return [];

  if (said.trim() === "" || better.trim() === "") return [];

  if (said.trim() === better.trim()) return [];

  return [
    {
      kind: KINDS.find((one) => one === kind) ?? "clarity",
      said: said.trim(),
      better: better.trim(),
      why: clip(why.trim(), WHY_CHARS),
    },
  ];
}

function isJsonObject(value: Json | undefined): value is JsonObject {
  return value === Object(value) && !Array.isArray(value);
}

function isString(value: Json | undefined): value is string {
  return value === String(value);
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
