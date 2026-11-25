// Dates are ISO calendar days in Japan. Adapters assign flows to the first
// applicable valuation cutoff before passing them to this calculation.
export type Valuation = { date: string; yen: number | null };
export type FlowKind = "deposit" | "withdrawal" | "internal" | "unknown";
export type Flow = { date: string; yen: number; kind: FlowKind };
export type Coverage = { start: string; end: string };
export type Point = {
  date: string;
  value: number | null;
  baseline: number | null;
  adjustedValue: number | null;
  profit: number | null;
  deposits: number | null;
  withdrawals: number | null;
  unknownCount: number;
  status: "ok" | "no-history" | "missing-value" | "unclassified";
};

export function transferKind(fromInside: boolean | null, toInside: boolean | null): FlowKind {
  if (fromInside === null || toInside === null) return "unknown";
  if (fromInside === toInside) return "internal";
  return toInside ? "deposit" : "withdrawal";
}

function checkDate(day: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(day) || new Date(day).toJSON()?.slice(0, 10) !== day) {
    throw new Error("日付を確認してください。");
  }
}

function checkYen(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("円換算額を確認してください。");
}

export function analyze(valuations: readonly Valuation[], flows: readonly Flow[], coverage: Coverage | null) {
  if (coverage) {
    checkDate(coverage.start);
    checkDate(coverage.end);
    if (coverage.start > coverage.end) throw new Error("照会期間の開始日と終了日を確認してください。");
  }

  const history = [...valuations].sort((a, b) => a.date.localeCompare(b.date));
  const entries = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of entries) {
    checkDate(row.date);
    checkYen(row.yen);
    if (!coverage || row.yen < 0 || row.date < coverage.start || row.date > coverage.end) {
      throw new Error("照会期間または明細金額を確認してください。");
    }
  }

  let initial: { date: string; yen: number } | null = null;
  let deposits = 0;
  let withdrawals = 0;
  let cursor = 0;
  const unknownDates: string[] = [];
  const points: Point[] = [];
  for (const row of history) {
    checkDate(row.date);
    if (row.yen !== null) checkYen(row.yen);
    if (points.at(-1)?.date === row.date) throw new Error("同じ評価日のデータが複数あります。");
    const covered = coverage && row.date >= coverage.start && row.date <= coverage.end;
    if (!initial && covered && row.yen !== null) initial = { date: row.date, yen: row.yen };

    while (cursor < entries.length && entries[cursor].date <= row.date) {
      const flow = entries[cursor++];
      if (!initial || flow.date <= initial.date) continue;
      switch (flow.kind) {
        case "deposit": deposits += flow.yen; break;
        case "withdrawal": withdrawals += flow.yen; break;
        case "internal": break;
        default: unknownDates.push(flow.date);
      }
    }

    const baseline = covered && initial && !unknownDates.length
      ? initial.yen + deposits - withdrawals : null;
    const profit = baseline !== null && row.yen !== null ? row.yen - baseline : null;
    points.push({
      date: row.date, value: row.yen, baseline, profit,
      adjustedValue: profit !== null && initial ? initial.yen + profit : null,
      deposits: baseline !== null ? deposits : null,
      withdrawals: baseline !== null ? withdrawals : null,
      unknownCount: unknownDates.length,
      status: !covered ? "no-history" : row.yen === null ? "missing-value" :
        unknownDates.length ? "unclassified" : "ok"
    });
  }
  return { initial, points, unknownDates };
}
