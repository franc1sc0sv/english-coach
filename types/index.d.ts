export type TipKind = "grammar" | "word" | "pronunciation" | "clarity";

export type Tip = { kind: TipKind; said: string; better: string; why: string };

export type Review = { tips: Tip[]; prompt: string };

declare module "claude-code" {
  interface PluginState {
    "english-coach": { review: Review | null };
  }
}
