import { analyze } from "./analytics.ts";
import { chart, provisionalSeries, series } from "./chart.ts";

const yen = (n: number | null) => n === null ? "—" : n.toLocaleString("ja-JP") + " 円";
const statusText = {
  ok: "集計済み", "no-history": "履歴不足", "missing-value": "評価額欠測", unclassified: "未分類"
};

export function results(result: ReturnType<typeof analyze>) {
  const section = document.createElement("section");
  const latest = result.points.at(-1);
  if (!latest) { section.textContent = "資産評価額がありません。"; return section; }
  const summary = document.createElement("dl");
  const net = latest.deposits !== null && latest.withdrawals !== null
    ? latest.deposits - latest.withdrawals : null;
  const metrics = [
    ["入出金を除いた資産額", latest.status === "unclassified" ? "分類待ち" : yen(latest.adjustedValue)],
    ["開始時からの運用損益", (latest.profit !== null && latest.profit > 0 ? "+" : "") + yen(latest.profit)],
    ["最新評価額（" + latest.date + "）", yen(latest.value)],
    ["開始評価額（" + (result.initial?.date ?? "未確定") + "）", yen(result.initial?.yen ?? null)],
    ["累計外部入金", yen(latest.deposits)], ["累計外部出金", yen(latest.withdrawals)],
    ["累計純入金", yen(net)]
  ];
  if (latest.provisionalAdjustedValue !== null) {
    metrics.splice(1, 0, [provisionalSeries.label, yen(latest.provisionalAdjustedValue)]);
  }
  for (const [name, value] of metrics) {
    const box = document.createElement("div");
    const term = document.createElement("dt"), amount = document.createElement("dd");
    term.textContent = name; amount.textContent = value;
    box.append(term, amount); summary.append(box);
  }
  const notice = document.createElement("p");
  const warnings = [...new Set(result.points.filter(p => p.status !== "ok").map(p => statusText[p.status]))];
  notice.textContent = warnings.length ? warnings.join("・") + "。詳細は日別明細を参照してください。" : "";
  if (result.unknownDates.length) {
    notice.append(" " + result.unknownDates[0] + " 以降に未分類の明細が" + result.unknownDates.length +
      "件あります。「暫定資産額」は、判明している外部入金を引き、外部出金を足し戻した金額です。");
  }
  const details = document.createElement("details");
  const title = document.createElement("summary");
  title.textContent = "日別明細";
  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  const showProvisional = result.points.some(point => point.provisionalAdjustedValue !== null);
  const extraColumn = showProvisional ? [provisionalSeries.label] : [];
  for (const name of ["評価日", "資産評価額", "入出金を除いた資産額", ...extraColumn, "基準額", "運用損益", "状態"]) {
    const cell = document.createElement("th"); cell.textContent = name; header.append(cell);
  }
  const body = table.createTBody();
  for (const point of result.points) {
    const row = body.insertRow();
    const extraValue = showProvisional ? [yen(point.provisionalAdjustedValue)] : [];
    for (const value of [point.date, yen(point.value), yen(point.adjustedValue), ...extraValue, yen(point.baseline), yen(point.profit), statusText[point.status]]) {
      row.insertCell().textContent = value;
    }
  }
  details.append(title, table);
  const lines = showProvisional ? [...series, provisionalSeries] : series;
  section.append(summary, notice, chart(result.points, lines), chart(result.points, [series[2]]), details);
  return section;
}
