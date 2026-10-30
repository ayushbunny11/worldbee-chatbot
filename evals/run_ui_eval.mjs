// Runs the RAG evaluation through the real web UI (no direct API calls).
// For each question: new chat, attach the PDF with the paperclip, type the
// question, wait for the streamed answer, and record the answer and the sources
// the UI shows. Grading happens separately.
//
//   node evals/run_ui_eval.mjs --pdf Attention.pdf --csv ground_truth.csv --out results.json
//   Writes the JSON and a CSV next to it (same name, .csv) with one row per question.
//   Options: --ids 1,5,9   --delay 12   --app http://localhost:5173   --model gemini-2.5-flash
import { createRequire } from "module";
import fs from "fs";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const PDF = arg("pdf");
const CSV = arg("csv");
const OUT = arg("out", "results.json");
const APP = arg("app", "http://localhost:5173");
const MODEL = arg("model", "gemini-2.5-flash");
const DELAY_MS = Number(arg("delay", "12")) * 1000;
const IDS = arg("ids", "").split(",").filter(Boolean).map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal CSV parser (quoted fields, "" escapes, commas and newlines inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

// With --ids, questions run in that order, so a run cut short by quota still covers a mix.
const questions = parseCsv(fs.readFileSync(CSV, "utf8"))
  .filter((q) => !IDS.length || IDS.includes(Number(q.id)))
  .sort((a, b) => (IDS.length ? IDS.indexOf(Number(a.id)) - IDS.indexOf(Number(b.id)) : 0));
const pdfBuffer = fs.readFileSync(PDF);
const pdfName = PDF.split("/").pop();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(APP);
await page.evaluate((model) => {
  localStorage.setItem("worldbee.config", JSON.stringify({
    provider: "gemini", model, apiKeys: { gemini: "injected-by-proxy", openai: "" },
    tavilyApiKey: "", systemPrompt: "", personalInfo: "",
  }));
}, MODEL);
await page.reload();

async function freshChatWithFile() {
  const clear = page.locator("button", { hasText: "New chat" });
  if (await clear.isEnabled().catch(() => false)) await clear.click();
  await page.waitForSelector(".attachment", { state: "detached", timeout: 15000 }).catch(() => {});
  await page.locator("form input[type=file]").setInputFiles([{ name: pdfName, mimeType: "application/pdf", buffer: pdfBuffer }]);
  await page.waitForSelector(".attachment.ready", { timeout: 120000 });
}

async function ask(question) {
  await page.fill("textarea", question);
  await page.keyboard.press("Enter");
  // Done when the stop button is gone and the reply holds text or an error.
  await page.waitForFunction(() => {
    const msg = [...document.querySelectorAll(".msg-assistant")].pop();
    if (!msg || document.querySelector(".send-btn.stop")) return false;
    return Boolean(msg.querySelector(".error") || msg.querySelector(".markdown")?.innerText.trim());
  }, null, { timeout: 180000, polling: 250 });
  await sleep(300);
  return page.evaluate(() => {
    const msg = [...document.querySelectorAll(".msg-assistant")].pop();
    const text = (sel) => [...msg.querySelectorAll(sel)].map((e) => e.innerText.trim());
    return {
      answer: msg.querySelector(".markdown")?.innerText.trim() ?? "",
      error: msg.querySelector(".error")?.innerText.trim() ?? "",
      steps: text(".step-head"),
      sources: [...msg.querySelectorAll(".source.file")].map((e) => e.innerText.trim().replace(/\s+/g, " ")),
    };
  });
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const COLUMNS = ["id", "type", "question", "ground_truth", "truth_page", "answer", "retrieved_pages", "page_hit", "searched_files", "error", "seconds", "verdict", "grader_notes"];
function writeCsv(rows) {
  const lines = rows.map((r) => {
    const pages = [...new Set(r.sources.map((s) => (s.match(/p\. (\d+)/) || [])[1]).filter(Boolean))];
    const hit = r.truth_page ? (pages.includes(String(r.truth_page)) ? "yes" : "no") : "n/a";
    const cells = { ...r, ground_truth: r.truth, retrieved_pages: pages.join(" "), page_hit: hit, searched_files: r.steps.length ? "yes" : "no", verdict: "", grader_notes: "" };
    return COLUMNS.map((c) => csvCell(cells[c])).join(",");
  });
  fs.writeFileSync(OUT.replace(/\.json$/, "") + ".csv", [COLUMNS.join(","), ...lines].join("\n") + "\n");
}

const results = [];
let dailyLimit = false;
for (const q of questions) {
  let out, tries = 0, started = Date.now();
  do {
    await freshChatWithFile();
    started = Date.now();
    out = await ask(q.question);
    if (!/429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(out.error)) break;
    // A daily quota won't recover by waiting: stop the run and keep what we have.
    if (/PerDay|per day|daily/i.test(out.error)) { dailyLimit = true; break; }
    console.log(`  q${q.id}: per-minute limit, waiting 65s (try ${tries + 1})`);
    await sleep(65000);
  } while (++tries < 2);
  const row = { id: Number(q.id), type: q.question_type, question: q.question, truth: q.ground_truth_answer, truth_page: q.source_page, seconds: Math.round((Date.now() - started) / 100) / 10, ...out };
  results.push(row);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  writeCsv(results);
  console.log(`q${q.id} [${q.question_type}] ${row.error ? "ERROR " + row.error.slice(0, 80) : row.answer.slice(0, 90).replace(/\n/g, " ")} | sources: ${row.sources.join("; ") || "-"}`);
  if (dailyLimit) { console.log("Daily quota reached: stopping. Re-run the remaining ids later."); break; }
  await sleep(DELAY_MS);
}
await browser.close();
console.log(`Done: ${results.length} questions -> ${OUT}`);
