import type { ModelCompleteInput, ModelCompleteResult, On, RenderNode } from "claude-code";
import { expect, mock, test } from "claude-code/testing";
import type { Engine } from "claude-code/testing";

const STOCK_TEXT = "stock band";

const LONG_PROMPT = "Let's make a researchment for that, so we know how the plugin works today.";

const REPLY = JSON.stringify({
  tips: [
    {
      kind: "word",
      said: "make a researchment",
      better: "do some research",
      why: "Researchment is not a word; say research.",
    },
  ],
});

const REWRITE = "Let's do some research on that, so we know how the plugin works today.";

const sessionStart = { cwd: "/work", surface: "terminal" as const, isInteractive: true };

const band = {
  surface: "terminal" as const,
  component: "AbovePrompt" as const,
  requestId: "above-prompt",
  viewport: { columns: 100, rows: 30 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 95,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
};

function prompt(text: string, kind: "composer" | "task-notification" = "composer") {
  return { text, wait: false, origin: { kind } } as const;
}

function textOf(tree: RenderNode): string {
  return JSON.stringify(tree);
}

function world(on: On) {
  const clock = mock.clock(on);
  const store = new Map<string, unknown>();
  const requests: ModelCompleteInput[] = [];
  const copies: string[] = [];
  let finished = 0;
  let hold: Promise<void> = Promise.resolve();

  on("store.get", async (_$, e) => ({ value: structuredClone(store.get(e.key)) }));
  on("store.set", async (_$, e) => {
    store.set(e.key, structuredClone(e.value));

    return { value: undefined };
  });
  on("session.start", async (_$, e) => ({ cwd: e.cwd }));
  on("command.register", async (_$, e) => ({ value: { command: e.name } }));
  on("ui.copy", async (_$, e) => {
    copies.push(e.text);

    return { value: { isCopied: true as const } };
  });
  on("model.complete", async (_$, e) => {
    requests.push(e);
    await hold;
    finished += 1;

    const answer: ModelCompleteResult = {
      isAnswered: true,
      text: e.system?.startsWith("Rewrite") ? REWRITE : REPLY,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    };

    return { value: answer };
  });
  on("prompt.submit", async (_$, e) => ({ text: e.text }));
  on("ui.render", async () => ({ type: "Text", props: {}, children: [STOCK_TEXT] }));

  return {
    requests,
    copies,
    reviewed: async (count: number) => {
      for (let tick = 0; tick < 1000; tick += 1) {
        await clock.settle();

        if (finished >= count) return;

        await Promise.resolve();
      }

      throw new Error(`Expected ${count} reviews, saw ${finished}.`);
    },
    holdModel: () => {
      let release = () => {};
      hold = new Promise((resolve) => {
        release = resolve;
      });

      return release;
    },
  };
}

async function settle($: Engine) {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  await $.ui.render(band);
}

test("reviews a long prompt with Haiku and shows the tips above the prompt", async ($, on) => {
  const { requests, reviewed } = world(on);
  await $.session.start(sessionStart);
  await $.prompt.submit(prompt(LONG_PROMPT));
  await reviewed(1);
  await settle($);

  expect(requests[0]!.model).toBe("claude-haiku-5-5");
  expect(requests[0]!.prompt).toContain("researchment");
  expect(requests[0]!.maxTokens).toBe(500);
  expect(requests.length).toBe(1);

  const drawn = textOf(await $.ui.render(band));
  expect(drawn).toContain("make a researchment");
  expect(drawn).toContain("do some research");
  expect(drawn).toContain("Copy full rewrite");
  expect(drawn).toContain("Word");
  expect(drawn).toContain("1 fix");
  expect(drawn).toContain(STOCK_TEXT);
});

test("skips short prompts, slash commands and prompts the person did not write", async ($, on) => {
  const { requests } = world(on);
  await $.session.start(sessionStart);
  await $.prompt.submit(prompt("fix the bug please"));
  await $.prompt.submit(prompt(`/review ${LONG_PROMPT}`));
  await $.prompt.submit(prompt(LONG_PROMPT, "task-notification"));
  await settle($);

  expect(requests.length).toBe(0);
  expect(textOf(await $.ui.render(band))).toContain(STOCK_TEXT);
});

test("drops a late review once a newer prompt was sent", async ($, on) => {
  const { reviewed, holdModel } = world(on);
  await $.session.start(sessionStart);
  const release = holdModel();
  await $.prompt.submit(prompt(LONG_PROMPT));
  await settle($);
  await $.prompt.submit(prompt("ok"));
  release();
  await reviewed(1);
  await settle($);

  expect(textOf(await $.ui.render(band))).toContain(STOCK_TEXT);
});

test("copy asks for the rewrite only then, copies it and clears the band", async ($, on) => {
  const { copies, requests, reviewed } = world(on);
  await $.session.start(sessionStart);
  await $.prompt.submit(prompt(LONG_PROMPT));
  await reviewed(1);
  await settle($);

  await $.ui.press({ plugin: "english-coach", key: "copy" });

  expect(requests.length).toBe(2);
  expect(requests[1]!.prompt).toBe(LONG_PROMPT);
  expect(copies).toEqual([REWRITE]);
  expect(textOf(await $.ui.render(band))).toContain(STOCK_TEXT);
});

test("the command turns tips off", async ($, on) => {
  const { requests } = world(on);
  await $.session.start(sessionStart);
  await $.command.run({
    command: "english-coach",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 80 },
  });
  await $.prompt.submit(prompt(LONG_PROMPT));
  await settle($);

  expect(requests.length).toBe(0);
});
