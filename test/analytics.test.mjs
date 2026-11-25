import test from "node:test";
import assert from "node:assert/strict";
import { analyze, transferKind } from "../src/analytics.ts";
import { decodeCsv, readFlows } from "../src/csv.ts";
import { coverage, layout, sampleCsv, valuations } from "../src/preview-data.ts";

const flows = readFlows(sampleCsv, layout);

test("開始日の反映済み入金、外部入出金、配当と税を区別する", () => {
  const result = analyze(valuations.toReversed(), flows.toReversed(), coverage);
  assert.deepEqual(result.points.map(p => p.profit), [0, 30000, 30000, 30800]);
  assert.deepEqual(result.points.map(p => p.adjustedValue), [1000000, 1030000, 1030000, 1030800]);
  assert.ok(result.points.every(p => p.provisionalAdjustedValue === null));
  const latest = result.points.at(-1);
  assert.equal(latest.deposits, 200000);
  assert.equal(latest.withdrawals, 50000);
  assert.equal(latest.baseline, 1150000);
});

test("CSVの同一行を別取引として数える", () => {
  const repeated = sampleCsv + '\n2026-01-08,外部入金,"200,000",';
  assert.equal(analyze(valuations, readFlows(repeated, layout), coverage).points.at(-1).deposits, 400000);
});

test("集計境界をまたぐ振替と未確認の振替", () => {
  assert.equal(transferKind(true, false), "withdrawal");
  assert.equal(transferKind(false, true), "deposit");
  assert.equal(transferKind(true, true), "internal");
  assert.equal(transferKind(true, null), "unknown");
});

test("履歴外、評価額欠測、未分類による保留を扱う", () => {
  const result = analyze([
    { date: "2026-01-01", yen: 1 }, ...valuations,
    { date: "2026-01-11", yen: null }, { date: "2026-02-10", yen: 100 }
  ], [...flows, { date: "2026-01-16", yen: 1, kind: "unknown" }], coverage);
  assert.deepEqual(result.points.map(p => p.status),
    ["no-history", "ok", "ok", "missing-value", "unclassified", "unclassified", "no-history"]);
  assert.deepEqual(result.points.map(p => p.profit), [null, 0, 30000, null, null, null, null]);
  assert.deepEqual(result.points.map(p => p.adjustedValue), [null, 1000000, 1030000, null, null, null, null]);
  assert.deepEqual(result.points.map(p => p.provisionalAdjustedValue), [null, null, null, null, 1030000, 1030800, null]);
  assert.deepEqual(result.unknownDates, ["2026-01-16"]);
});

test("明細ゼロ、範囲不正、日付不正、重複評価日", () => {
  assert.equal(analyze(valuations, [], coverage).points.at(-1).profit, 180800);
  assert.throws(() => analyze(valuations, [], { ...coverage, end: "2025-01-01" }));
  assert.throws(() => analyze([{ date: "2026-02-31", yen: 1 }], [], coverage));
  assert.throws(() => analyze([...valuations, valuations[0]], [], coverage));
});

test("CSVの引用符、BOM、未知の摘要、不正な金額", () => {
  assert.equal(readFlows("\uFEFF" + sampleCsv, layout).length, 5);
  assert.equal(readFlows(sampleCsv.replace("外部出金", "不明"), layout)[2].kind, "unknown");
  assert.throws(() => readFlows(sampleCsv.replace("50000", "5O000"), layout));
  assert.throws(() => readFlows(sampleCsv.replace(",,50000", ",1,50000"), layout));
  assert.throws(() => readFlows(sampleCsv.replace("摘要", "内容"), layout));
  assert.equal(decodeCsv(Uint8Array.from([0x93,0xfc,0x8b,0xe0]).buffer), "入金");
});
