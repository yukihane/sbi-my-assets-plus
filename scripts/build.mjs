import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { sampleCsv } from "../src/preview-data.ts";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const downloadUrl = "https://github.com/yukihane/sbi-my-assets-plus/releases/latest/download/sbi-my-assets-plus.user.js";
const metadata = [
  "// ==UserScript==",
  "// @name         SBI My Assets Plus",
  "// @namespace    sbi-my-assets-plus",
  "// @version      " + version,
  "// @updateURL    " + downloadUrl,
  "// @downloadURL  " + downloadUrl,
  "// @description  My資産の評価額と入出金明細を取得し、入出金を除いた資産額を表示する",
  "// @match        https://site.sbisec.co.jp/account/assets",
  "// @noframes",
  "// @grant        GM.xmlHttpRequest",
  "// @connect      member.c.sbisec.co.jp",
  "// @run-at       document-idle",
  "// ==/UserScript=="
].join("\n");

await build({
  entryPoints: ["src/preview.ts"], outfile: "dist/sbi-my-assets-plus.user.js",
  bundle: true, platform: "browser", format: "iife", target: "es2022",
  banner: { js: metadata }
});
await writeFile("dist/sample.csv", "\uFEFF" + sampleCsv);
await writeFile("dist/sbi-my-assets-plus-preview.html", `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>SBI My Assets Plus 開発プレビュー</title>
<body style="max-width:920px;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif">
<h1>My資産 開発プレビュー</h1>
<p id="preview-anchor"><a href="./sample.csv" download>テスト明細CSVを保存</a></p>
<script src="./sbi-my-assets-plus.user.js"></script></body></html>`);
