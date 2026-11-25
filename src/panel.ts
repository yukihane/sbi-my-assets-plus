import { analyze, type Coverage, type Flow, type Valuation } from "./analytics.ts";
import { chart, provisionalSeries, series } from "./chart.ts";

const yen = (n: number | null) => n === null ? "—" : n.toLocaleString("ja-JP") + " 円";
const statusText = {
  ok: "集計済み", "no-history": "履歴不足", "missing-value": "評価額欠測", unclassified: "未分類"
};

export function createResultsView() {
  let selectedBase = "";
  return (history: Valuation[], flows: Flow[], coverage: Coverage | null) => {
    const full = analyze(history, flows, coverage);
    if (!coverage || !full.initial) return results(full);
    const firstDate = full.initial.date;
    const fromFirst = { ...full, points: full.points.filter(point => point.date >= firstDate) };

    const label = document.createElement("label");
    const select = document.createElement("select");
    select.name = "baseDate";
    select.add(new Option("自動（" + firstDate + "）", ""));
    for (const point of full.points) {
      if (point.value !== null && coverage.start <= point.date && point.date <= coverage.end) {
        select.add(new Option(point.date, point.date));
      }
    }
    select.value = selectedBase;
    if (select.selectedIndex < 0) select.selectedIndex = 0;
    selectedBase = select.value;
    label.append("損益の基準日（この日を0円として表示） ", select);
    const view = document.createElement("div");
    const body = document.createElement("div");
    function redraw() {
      selectedBase = select.value;
      const date = selectedBase || firstDate;
      const analysis = date === firstDate ? fromFirst :
        analyze(history.filter(row => row.date >= date), flows, coverage);
      body.replaceChildren(results(analysis));
    }
    select.addEventListener("change", redraw);
    view.append(label, body);
    redraw();
    return view;
  };
}

function results(result: ReturnType<typeof analyze>) {
  const section = document.createElement("section");
  const latest = result.points.at(-1);
  if (!latest) { section.textContent = "資産評価額がありません。"; return section; }
  const summary = document.createElement("dl");
  const net = latest.deposits !== null && latest.withdrawals !== null
    ? latest.deposits - latest.withdrawals : null;
  const metrics = [
    ["入出金を除いた資産額", latest.status === "unclassified" ? "分類待ち" : yen(latest.adjustedValue)],
    ["基準日からの運用損益", (latest.profit !== null && latest.profit > 0 ? "+" : "") + yen(latest.profit)],
    ["最新評価額（" + latest.date + "）", yen(latest.value)],
    ["基準日の評価額（" + (result.initial?.date ?? "未確定") + "）", yen(result.initial?.yen ?? null)],
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
