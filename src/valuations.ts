import type { Valuation } from "./analytics.ts";

export const balanceSeries = [
  { key: "balances", label: "預り金・iDeCoを含む" },
  { key: "balancesWithoutDeposit", label: "預り金を除外" },
  { key: "balancesWithoutIdeco", label: "iDeCoを除外" },
  { key: "balancesWithoutDepositAndIdeco", label: "預り金・iDeCoを除外" }
] as const;

export function readValuations(data: unknown, key: typeof balanceSeries[number]["key"] = "balances"): Valuation[] {
  const rows: unknown = data !== null && typeof data === "object" && Object.hasOwn(data, key)
    ? (data as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(rows)) {
    throw new Error(`評価額JSONに ${key} 配列がありません。`);
  }

  const dates = new Set<string>();
  const points = rows.map((row: unknown): Valuation => {
    if (!Array.isArray(row) || row.length !== 2) throw new Error(`${key} の行形式を確認してください。`);
    const [timestamp, yen] = row;
    if (!Number.isSafeInteger(timestamp) || timestamp < 1e12 || timestamp >= 1e13) {
      throw new Error("評価日のタイムスタンプが不正です。");
    }
    if (yen !== null && !Number.isSafeInteger(yen)) throw new Error("評価額が円単位の整数ではありません。");
    // The timestamp labels the Japanese calendar day, not the intraday valuation cutoff.
    const date = new Date(timestamp + 9 * 3600_000).toISOString().slice(0, 10);
    if (dates.has(date)) throw new Error("同じ評価日のデータが複数あります。");
    dates.add(date);
    return { date, yen };
  });
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
