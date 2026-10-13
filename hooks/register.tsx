import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import { SYSTEM, isWorthReview, parse, prose } from "../lib/coach.ts";
import type { TipKind } from "../types";

const COMMAND = "english-coach";

const ENABLED_KEY = "enabled";

const MODEL = "haiku";

const KIND_LABELS: Record<TipKind, string> = {
  grammar: "Grammar",
  word: "Word",
  pronunciation: "Misheard",
  clarity: "Clearer",
};

const LABEL_COLUMNS = 10;

const review = atom({ plugin: "english-coach", key: "review" } as const, null);

let isInteractive = false;

let epoch = 0;

async function isEnabled($: EngineInterface): Promise<boolean> {
  return (await $.store.get(ENABLED_KEY)) !== false;
}

async function coach($: EngineInterface, text: string, at: number): Promise<void> {
  const reply = await $.model.complete({
    model: MODEL,
    system: [{ text: SYSTEM, cache: true }],
    prompt: `The prompt they sent:\n<prompt>\n${prose(text)}\n</prompt>`,
    maxTokens: 1500,
    effort: "low",
    timeoutMs: 30000,
  });

  if (!reply.isAnswered || at !== epoch) return;

  const found = parse(reply.text);

  if (found !== undefined) await update($, review, () => found);
}

export const register: Register = (on) => {
  isInteractive = false;
  epoch = 0;

  on("session.start", async ($, e, next) => {
    isInteractive = e.isInteractive;
    await $.command.register({
      name: COMMAND,
      description: "Turn English tips on or off",
    });

    return next(e);
  });

  on("command.run", { command: COMMAND }, async ($) => {
    const isOn = !(await isEnabled($));
    await $.store.set(ENABLED_KEY, isOn);

    if (!isOn) await update($, review, () => null);

    return { text: `English tips ${isOn ? "on" : "off"}.` };
  });

  on("prompt.submit", async ($, e, next) => {
    epoch += 1;
    const at = epoch;
    await update($, review, () => null);

    const isOwnWords = e.origin.kind === "composer";

    if (isInteractive && isOwnWords && isWorthReview(e.text) && (await isEnabled($))) {
      $.clock.after(0, () => {
        void coach($, e.text, at).catch(() => undefined);
      });
    }

    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const shown = await read($, review);

    if (shown === null || e.props.hasSurvey) return next(e);

    const beneath = await next(e);
    const { Box, Button, Text } = $.ui.resolve(e);

    const dismiss = () => update($, review, () => null);

    const copy = async () => {
      await $.ui.copy({ text: shown.rewrite, surface: e.surface });
      await update($, review, () => null);
    };

    return (
      <Box flexDirection="column">
        {beneath}
        <Box flexDirection="column" paddingX={1} paddingTop={1}>
          <Text>
            <Text color="suggestion" bold>
              English tip
            </Text>
            <Text dimColor>{`  ${shown.tips.length} ${shown.tips.length === 1 ? "fix" : "fixes"}`}</Text>
          </Text>
          <Box flexDirection="column" paddingTop={1}>
            {shown.tips.map((tip, index) => (
              <Box key={`tip-${index}`} paddingLeft={2}>
                <Box width={LABEL_COLUMNS} flexShrink={0}>
                  <Text color="warning">{KIND_LABELS[tip.kind]}</Text>
                </Box>
                <Box flexDirection="column">
                  <Text>
                    <Text color="error" strikethrough>
                      {tip.said}
                    </Text>
                    <Text dimColor>{"  ->  "}</Text>
                    <Text color="success" bold>
                      {tip.better}
                    </Text>
                  </Text>
                  <Text dimColor>{tip.why}</Text>
                </Box>
              </Box>
            ))}
          </Box>
          <Box paddingLeft={2} paddingTop={1} columnGap={2}>
            {shown.rewrite === "" ? null : (
              <Button
                key="copy"
                label="Copy full rewrite"
                hotkey="1"
                plain
                onPress={copy}
              />
            )}
            <Button
              key="dismiss"
              label="Dismiss"
              hotkey="2"
              plain
              role="dismiss"
              onPress={dismiss}
            />
          </Box>
        </Box>
      </Box>
    );
  });
};
