import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/analytics.ts";
import { reconcileInstallments } from "../src/card-installments.ts";
import { exchangeCandidate } from "../src/exchange.ts";
import { readStatementPage } from "../src/sbi.ts";

const transfer = "投信るいとうお買付預り金振替";
const range = { start: "2040-01-01", end: "2040-03-31" };
const payment = { payDepDate: "2040/01/30", detailKbn: "クレカ引落", dispAbstract: "投信積立クレジットカード入金",
  payDepKbn: "入金", payAmount: "1,200" };
const debit = { ...payment, detailKbn: "その他", dispAbstract: transfer, payDepKbn: "出金" };
const receipt = { ...debit, payDepDate: "2040/02/12", payDepKbn: "入金" };
const metal = { ...debit, detailKbn: "各商品取引口座への振替出金", dispAbstract: "金・銀・プラチナ取引口座へ振替出金" };

function statements(records) {
  return readStatementPage({ totalCount: records.length, pageCount: 1, pageNumber: 1, pageSize: 10,
    detailsConditions: ["入金：すべて", "出金：すべて"], depositRecordList: records }, range, 1).rows;
}

test("照合した積立は後続の振替入金日に1回計上し、貴金属への出金は別に数える", () => {
  const entries = statements([receipt, debit, metal, payment]);
  assert.deepEqual(reconcileInstallments(entries), {
    matched: [{ cardDate: "2040-01-30", depositDate: "2040-02-12", yen: 1200 }], unmatchedTransfers: 0
  });
  assert.ok(entries.every(row => !row.defaulted && !exchangeCandidate(row)));
  assert.equal(entries[2].purpose, "metal-withdrawal");
  const history = ["2040-01-01", "2040-01-30", "2040-02-12"].map(date => ({ date, yen: 100000 }));
  const points = analyze(history, entries, range).points;
  assert.deepEqual(points.map(p => [p.deposits, p.withdrawals]), [[0, 0], [0, 1200], [1200, 1200]]);
  assert.equal(analyze(history.slice(1), entries, range).points.at(-1).deposits, 1200);
});

test("期間端の欠落・重複候補・別の金額や別用途を一組として扱わない", () => {
  for (const records of [[receipt], [payment, debit], [debit, receipt], [payment, debit, receipt, receipt],
    [payment, payment, debit, receipt], [payment, debit, { ...debit, payDepDate: "2040/02/01" }, receipt],
    [payment, debit, { ...receipt, payAmount: "200" }], [payment, debit, { ...receipt, payDepDate: "2040/03/30" }],
    [payment, debit, { ...receipt, dispAbstract: "別用途" }]]) {
    const entries = statements(records);
    const before = structuredClone(entries);
    const result = reconcileInstallments(entries);
    assert.equal(result.matched.length, 0);
    assert.equal(result.unmatchedTransfers, before.filter(r => r.purpose === "fund-transfer").length);
    assert.deepEqual(entries, before);
    assert.ok(entries.filter(r => r.purpose === "fund-transfer").every(r => !exchangeCandidate(r)));
  }
  assert.equal(statements([{ ...metal, dispAbstract: "別の商品口座へ振替出金" }])[0].defaulted, true);
});
