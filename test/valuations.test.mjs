import assert from "node:assert/strict";
import test from "node:test";
import { readValuations } from "../src/valuations.ts";
import { analyze } from "../src/analytics.ts";

const first = Date.parse("2040-01-01T00:00:00+09:00");
const second = first + 7 * 86400_000;

test("評価日を日本時間で整列し、全体系列のゼロ円と欠測を区別する", () => {
  const history = readValuations({
    balances: [[second, null], [first, 0]], balancesWithoutDeposit: [[first, 123]]
  });
  assert.deepEqual(history, [{ date: "2040-01-01", yen: 0 }, { date: "2040-01-08", yen: null }]);
  assert.ok(analyze(history, [], null).points.every(p => p.profit === null && p.status === "no-history"));
});

test("表示設定ごとの評価額を読み、不足した系列を全体の評価額で代用しない", () => {
  const data = {
    balances: [[first, 9000]], balancesWithoutDeposit: [[first, 7000]],
    balancesWithoutIdeco: [[first, 6000]], balancesWithoutDepositAndIdeco: [[first, 4000]]
  };
  for (const [key, [[, expected]]] of Object.entries(data)) {
    assert.equal(readValuations(data, key)[0].yen, expected);
  }
  assert.throws(() => readValuations({ balances: data.balances }, "balancesWithoutDepositAndIdeco"));
});

test("スキーマ変更、秒単位の時刻、不正金額、重複日は受け付けない", () => {
  for (const data of [null, {}, { balancesWithoutIdeco: [] },
    { balances: [[first]] }, { balances: [[first / 1000, 123]] },
    { balances: [[first, "123"]] }, { balances: [[first, 0], [first + 1, 0]] }]) {
    assert.throws(() => readValuations(data));
  }
  assert.deepEqual(readValuations({ balances: [] }), []);
});
