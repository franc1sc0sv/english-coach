import type { Tip, TipKind } from "../types";

type Json = null | boolean | number | string | Json[] | JsonObject;

type JsonObject = { [key: string]: Json };

const MIN_WORDS = 8;

const MAX_PROSE_CHARS = 8000;

const MAX_TIPS = 3;

const WHY_CHARS = 80;

const KINDS: readonly TipKind[] = ["grammar", "word", "pronunciation", "clarity"];

export const SYSTEM = `English coach for a non-native speaker who may dictate prompts by voice. Find up to 3 real errors in the prompt: grammar, wrong words or literal translations from their first language, words the dictation misheard, or unclear phrasing. Ignore code, paths, names, punctuation, capitalization, filler words and casual tone.
Reply with JSON only:
{"tips":[{"kind":"grammar|word|pronunciation|clarity","said":"2-5 exact words","better":"the fix","why":"plain reason under 60 chars, no grammar terms"}]}
No errors: {"tips":[]}`;

export const REWRITE_SYSTEM =
  "Rewrite the prompt in clear, natural English. Keep every request, detail, code, path and name. Reply with the rewrite only.";

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

export function parse(reply: string): Tip[] | undefined {
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

  return tips.length === 0 ? undefined : tips;
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
