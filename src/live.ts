import type { Coverage, FlowKind } from "./analytics.ts";
import { exchangeCandidate, fetchExchanges, markUnverified, reconcileExchanges } from "./exchange.ts";
import { adjacentBusinessDay } from "./business-day.ts";
import { reconcileInstallments, type Installment } from "./card-installments.ts";
import { createResultsView } from "./panel.ts";
import { fetchBalances, fetchStatement, type Statement } from "./sbi.ts";
import { balanceSeries, readValuations } from "./valuations.ts";

export function mountLive(root: ShadowRoot, form: HTMLFormElement, scope: HTMLSelectElement) {
  root.querySelector("#sample")!.remove();
  root.querySelector("input[name=json]")!.closest("label")!.remove();
  root.querySelector("small")!.remove();
  const button = form.querySelector("button")!;
  const status = root.querySelector("[role=alert]")!;
  const output = root.querySelector("#results")!;
  const results = createResultsView();
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
  let exchangeNotice = "";
  let installments: Installment[] = [];
  let classificationNotice = "";

  function render() {
    const selected = balanceSeries[scope.selectedIndex];
    const full = selected.key === "balances";
    review.hidden = !full || !review.childElementCount;
    let history = readValuations(balances, selected.key);
    if (full && coverage) {
      const { start, end } = coverage;
      history = history.filter(point => start <= point.date && point.date <= end);
    }
    output.replaceChildren(results(history, full ? entries : [], full ? coverage : null));
    if (!full) output.prepend("この集計対象では資金移動の分類が未確認のため、評価額のみ表示します。");
    else if (coverage) {
      if (installments.length) {
        const details = document.createElement("details");
        const title = document.createElement("summary");
        title.textContent = `照合済みのクレカ積立（${installments.length}組）`;
        const table = document.createElement("table");
        const header = table.createTHead().insertRow();
        for (const heading of ["カード入金・振替出金日", "外部入金の計上日（振替入金日）", "計上額"]) {
          const th = document.createElement("th");
          th.textContent = heading; header.append(th);
        }
        const body = table.createTBody();
        for (const group of installments) {
          const row = body.insertRow();
          for (const value of [group.cardDate, group.depositDate, group.yen.toLocaleString("ja-JP") + " 円"]) {
            row.insertCell().textContent = value;
          }
        }
        details.append(title, table); output.prepend(details);
      }
      output.prepend(`明細期間 ${coverage.start} ～ ${coverage.end}。入出金日で集計した参考値です。円貨明細に含まれない外部資金移動は反映されません。${classificationNotice}${exchangeNotice}`);
    }
  }
  function buildReview() {
    const groups = new Map<string, Statement[]>();
    for (const row of entries) {
      if (!row.defaulted) continue;
      const key = (row.incoming ? "入金 " : "出金 ") + row.description;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    if (!groups.size) return;
    const title = document.createElement("summary");
    title.textContent = "外部入出金として扱う明細の分類を変更（同じ区分・摘要に一括適用）";
    review.append(title);
    for (const [key, group] of groups) {
      const label = document.createElement("label");
      const select = document.createElement("select");
      select.add(new Option(group[0].incoming ? "外部入金" : "外部出金", group[0].incoming ? "deposit" : "withdrawal"));
      select.add(new Option("純入金額に含めない", "internal"));
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
      const [assets, statement] = await Promise.allSettled([fetchBalances(), fetchStatement(range)]);
      coverage = null; entries = [];
      if (assets.status === "rejected") throw assets.reason;
      balances = assets.value;
      if (statement.status === "fulfilled") {
        entries = statement.value; coverage = range;
        const { matched, unmatchedTransfers } = reconcileInstallments(entries);
        installments = matched;
        const metals = entries.filter(row => row.purpose === "metal-withdrawal").length;
        classificationNotice = metals ? ` 貴金属口座への振替${metals}件を外部出金に計上しました。` : "";
        if (unmatchedTransfers) classificationNotice += ` クレカ積立と照合できない投信振替${unmatchedTransfers}件は、明細の入出金方向で集計します。`;
        exchangeNotice = "";
        status.textContent = "";
        if (entries.some(exchangeCandidate)) {
          status.textContent = "米ドルの為替注文履歴を照合中…";
          try {
            const earliest = new Date(today);
            earliest.setUTCFullYear(earliest.getUTCFullYear() - 5);
            const cutoff = earliest.toISOString().slice(0, 10);
            let firstSettlement = adjacentBusinessDay(cutoff, 1);
            if (adjacentBusinessDay(firstSettlement, -1) < cutoff) firstSettlement = adjacentBusinessDay(firstSettlement, 1);
            const old = entries.filter(row => exchangeCandidate(row) && row.date < firstSettlement);
            markUnverified(old);
            const start = range.start > firstSettlement ? range.start : firstSettlement;
            const orders = entries.some(exchangeCandidate) ? await fetchExchanges({ start, end: range.end }) : [];
            const { matched, unresolved } = reconcileExchanges(entries, orders);
            exchangeNotice = ` 米ドルの両替${matched}件を外部入出金から除外しました。`;
            status.textContent = unresolved ? `円貨明細と一対一で照合できない米ドル約定が${unresolved}件あります。` : "";
            if (old.length) status.append(" 為替注文履歴の照会範囲外の入出金があります。");
          } catch (error) {
            markUnverified(entries.filter(exchangeCandidate));
            status.textContent = (error instanceof Error ? error.message : "為替注文履歴を確認できません。") +
              " 「その他」の入出金には未照合の両替が含まれる可能性があります。";
          }
        }
        buildReview();
      } else {
        status.textContent = statement.reason instanceof Error && statement.reason.message
          ? statement.reason.message : "入出金明細を読み取れませんでした。";
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
