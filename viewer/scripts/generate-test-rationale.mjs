#!/usr/bin/env node
/**
 * generate-test-rationale.mjs
 *
 * Generates per-choice rationale (which word is wrong + why) for a full-length
 * test's MCQ questions using the Claude API, and stores it in
 * test_questions.rationale (migration 0120) — the data behind Review Mode's
 * "Explain" toggle.
 *
 *   Usage:  cd viewer && npm run gen:rationale            # dsat-nov-2023
 *           npm run gen:rationale -- --slug <slug> --force --limit 5
 *
 *   Needs: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (root .env).
 *
 * - Forces a tool call so the model returns schema-valid JSON (no parsing of
 *   prose). System prompt is prompt-cached across questions.
 * - Idempotent: skips questions that already have rationale unless --force.
 * - Validates that each `wrong` is an exact substring of its choice (so the UI
 *   can highlight it); drops it otherwise, keeping the reason.
 * - The stored correct_answer is authoritative; the model only explains.
 */
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SLUG = opt("slug", "dsat-nov-2023");
const FORCE = flag("force");
const LIMIT = Number(opt("limit", "0")) || 0;
const CONCURRENCY = Number(opt("concurrency", "5")) || 5;

const miss = [];
if (!SUPA_URL) miss.push("SUPABASE_URL");
if (!SERVICE) miss.push("SUPABASE_SERVICE_KEY");
if (!API_KEY) miss.push("ANTHROPIC_API_KEY");
if (miss.length) {
  console.error("Missing env:", miss.join(", "));
  console.error("Add ANTHROPIC_API_KEY to the gitignored root .env, then re-run.");
  process.exit(2);
}

const service = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });

const SYSTEM = `You write concise answer explanations for official Digital SAT questions, for a teacher reviewing with a class.

You are given a question: an optional passage, the stem, the four choices (A–D), and the LETTER of the correct answer (authoritative — never dispute it).

For EACH present choice produce an explanation:
- CORRECT choice: a "reason" (one sentence) for why it is right. NO "wrong" field.
- INCORRECT choice: a "wrong" field = an EXACT substring copied verbatim from THAT choice's text (character-for-character, so it can be highlighted) marking the key problematic word/phrase; plus a "reason" (one sentence) for why it is wrong in this context.

Rules:
- "wrong" MUST be an exact substring of that choice's text. Prefer the single decisive word or short phrase.
- Reasons: concise, specific to THIS passage/stem, plain student-facing language. No markdown. Do not reference choices by letter inside reasons.
Return only via the emit_rationale tool.`;

const TOOL = {
  name: "emit_rationale",
  description: "Emit per-choice rationale for the question.",
  input_schema: {
    type: "object",
    properties: Object.fromEntries(
      ["A", "B", "C", "D"].map((L) => [
        L,
        {
          type: "object",
          properties: {
            wrong: { type: "string", description: "exact substring of this choice (incorrect only)" },
            reason: { type: "string" },
          },
          required: ["reason"],
        },
      ]),
    ),
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOne(q) {
  const choiceLines = ["A", "B", "C", "D"]
    .filter((L) => q.choices?.[L] != null)
    .map((L) => `${L}. ${q.choices[L]}`)
    .join("\n");
  const userText =
    (q.passage ? `Passage:\n${q.passage}\n\n` : "") +
    `Question: ${q.stem}\n\nChoices:\n${choiceLines}\n\nCorrect answer: ${q.correct_answer}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: "emit_rationale" },
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (attempt + 1) * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const tool = (data.content ?? []).find((b) => b.type === "tool_use");
    if (!tool) throw new Error("no tool_use in response");
    return sanitize(tool.input, q);
  }
  throw new Error("exhausted retries");
}

/** Keep only valid entries: correct choice → reason (no wrong); wrong choices →
 *  reason + `wrong` IFF it's an exact (case-insensitive) substring of the choice. */
function sanitize(raw, q) {
  const out = {};
  for (const L of ["A", "B", "C", "D"]) {
    const e = raw?.[L];
    if (!e || typeof e.reason !== "string" || !e.reason.trim()) continue;
    const isKey = L === q.correct_answer;
    const entry = { reason: e.reason.trim() };
    if (!isKey && typeof e.wrong === "string" && e.wrong.trim()) {
      const choice = q.choices?.[L] ?? "";
      if (choice.toLowerCase().includes(e.wrong.trim().toLowerCase())) entry.wrong = e.wrong.trim();
    }
    out[L] = entry;
  }
  return out;
}

async function main() {
  const { data: t, error: tErr } = await service.from("tests").select("id,title").eq("slug", SLUG).single();
  if (tErr || !t) { console.error(`Test '${SLUG}' not found.`); process.exit(1); }
  const { data: mods } = await service.from("test_modules").select("id,position").eq("test_id", t.id).order("position");
  const modIds = (mods ?? []).map((m) => m.id);
  const { data: qs } = await service
    .from("test_questions")
    .select("id,ref,type,passage,stem,choices,correct_answer,rationale")
    .in("module_id", modIds)
    .order("ref");
  let targets = (qs ?? []).filter((q) => q.type === "mcq" && q.choices && q.correct_answer);
  if (!FORCE) targets = targets.filter((q) => !q.rationale);
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`Test: ${t.title} (${SLUG}) · model ${MODEL}`);
  console.log(`MCQ questions to generate: ${targets.length}${FORCE ? " (force)" : ""}\n`);
  if (!targets.length) { console.log("Nothing to do."); return; }

  let ok = 0, fail = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (q) => {
        try {
          const rationale = await generateOne(q);
          const { error } = await service.from("test_questions").update({ rationale }).eq("id", q.id);
          if (error) throw new Error(error.message);
          ok++;
          console.log(`  ok   ${q.ref}  (${Object.keys(rationale).length} choices)`);
        } catch (e) {
          fail++;
          console.log(`  FAIL ${q.ref}  ${e?.message ?? e}`);
        }
      }),
    );
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
