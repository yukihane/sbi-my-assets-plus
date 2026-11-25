import { analyze, type Coverage, type FlowKind } from "./analytics.ts";
import { results } from "./panel.ts";
import { fetchBalances, fetchStatement, type Statement } from "./sbi.ts";
import { balanceSeries, readValuations } from "./valuations.ts";

export function mountLive(root: ShadowRoot, form: HTMLFormElement, scope: HTMLSelectElement) {
  root.querySelector("#sample")!.remove();
  root.querySelector("input[name=json]")!.closest("label")!.remove();
  root.querySelector("small")!.remove();
  const button = form.querySelector("button")!;
  const status = root.querySelector("[role=alert]")!;
  const output = root.querySelector("#results")!;
  const review = document.createElement("details");
  output.before(review);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(today);
  from.setUTCFullYear(from.getUTCFullYear() - 2);
  from.setUTCDate(from.getUTCDate() + 1);
  const fields = form.querySelector("fieldset")!;
  function dateInput(label: string, value: string) {
    const wrap = document.createElement("label");
    const input = document.createElement("input");
    input.type = "date"; input.required = true; input.value = value; input.max = today;
    wrap.append(label, input); fields.append(wrap);
    return input;
  }
  const start = dateInput("明細開始日 ", from.toISOString().slice(0, 10));
  const end = dateInput("明細終了日 ", today);
  let balances: unknown;
  let entries: Statement[] = [];
  let coverage: Coverage | null = null;

  function render() {
    const selected = balanceSeries[scope.selectedIndex];
    const full = selected.key === "balances";
    review.hidden = !full || !review.childElementCount;
    let history = readValuations(balances, selected.key);
    if (full && coverage) {
      const { start, end } = coverage;
      history = history.filter(point => start <= point.date && point.date <= end);
    }
    output.replaceChildren(results(analyze(history, full ? entries : [], full ? coverage : null)));
    if (!full) output.prepend("この集計対象では資金移動の分類が未確認のため、評価額のみ表示します。");
    else if (coverage) output.prepend(`明細期間 ${coverage.start} ～ ${coverage.end}。入出金日で集計した参考値です。円貨明細に含まれない外部資金移動は反映されません。`);
  }
  function buildReview() {
    const groups = new Map<string, Statement[]>();
    for (const row of entries) {
      if (row.kind !== "unknown") continue;
      const key = (row.incoming ? "入金 " : "出金 ") + row.description;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    if (!groups.size) return;
    const title = document.createElement("summary");
    title.textContent = "未分類の明細を確認（同じ区分・摘要に一括適用）";
    review.append(title);
    for (const [key, group] of groups) {
      const label = document.createElement("label");
      const select = document.createElement("select");
      select.add(new Option("未分類", "unknown"));
      select.add(new Option("対象内の取引", "internal"));
      select.add(new Option(group[0].incoming ? "外部入金" : "外部出金", group[0].incoming ? "deposit" : "withdrawal"));
      select.addEventListener("change", () => {
        for (const row of group) row.kind = select.value as FlowKind;
        render();
      });
      label.append(key + " ", select); review.append(label);
    }
  }
  scope.addEventListener("change", () => {
    try {
      render();
    } catch {
      output.textContent = "この集計対象の評価額を読み取れません。";
    }
  });
  review.hidden = true;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled) return;
    const range = { start: start.value, end: end.value };
    if (range.start > range.end) { status.textContent = "開始日は終了日以前を指定してください。"; return; }
    button.disabled = fields.disabled = true;
    output.replaceChildren(); review.replaceChildren(); review.hidden = true;
    status.textContent = "評価額と円貨入出金明細を取得中…";
    try {
      const [assets, csv] = await Promise.allSettled([fetchBalances(), fetchStatement(range)]);
      coverage = null; entries = [];
      if (assets.status === "rejected") throw assets.reason;
      balances = assets.value;
      if (csv.status === "fulfilled") {
        entries = csv.value; coverage = range;
        buildReview(); status.textContent = "";
      } else {
        status.textContent = csv.reason instanceof Error && csv.reason.message
          ? csv.reason.message : "入出金明細を読み取れませんでした。";
      }
      render(); scope.disabled = false;
    } catch (error) {
      scope.disabled = true; review.hidden = true;
      status.textContent = error instanceof Error ? error.message : "取得に失敗しました。";
    } finally {
      fields.disabled = button.disabled = false;
    }
  });
}
