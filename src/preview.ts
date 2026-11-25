import { analyze } from "./analytics.ts";
import { decodeCsv, readFlows } from "./csv.ts";
import { results } from "./panel.ts";
import { readValuations } from "./valuations.ts";
import { coverage, layout, sampleCsv, valuations } from "./preview-data.ts";

function mountPanel(container: HTMLElement, preview: boolean) {
  const host = document.createElement("section");
  host.id = "sbi-my-assets-plus";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host {display:block;background:white;color:#182e3b;font:16px/1.6 system-ui,sans-serif}
      h2 {margin:0} label {display:inline-block;margin:.35rem .8rem .35rem 0}
      input,button {font:inherit} button {cursor:pointer;padding:.25rem 1rem}
      dl {display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem}
      dl div {border-top:2px solid #d3dfdf;padding-top:.4rem}
      dt {font-size:.85rem} dd {margin:0;font-size:1.25rem;font-weight:600}
      figure {margin:1.5rem 0} figcaption span {border-left:4px solid;padding:0 .6rem}
      canvas {width:100%;height:auto} summary {cursor:pointer}
      table {width:100%;border-collapse:collapse} td,th {padding:.35rem;border-bottom:1px solid #ddd;text-align:right}
      [role=alert] {color:#953020} p:empty {display:none}
    </style>
    <h2>運用成績（UserScript）</h2>
    <p>${preview ? "架空データでのプレビュー。照会期間に対応するサンプル明細を使用します。" : "保存した資産推移のJSONを選ぶと、日別明細で評価額を照合できます。"}</p>
    <form>
      <fieldset><legend>評価額の照合</legend>
        <label>My資産の評価額JSON <input name="json" type="file" accept=".json,application/json"></label>
        <small>選択すると実際の評価額を表示します。テスト明細は使用しません。</small>
      </fieldset>
      <fieldset id="sample"><legend>架空データの集計</legend>
      <label>照会開始日 <input name="start" type="date" required></label>
      <label>照会終了日 <input name="end" type="date" required></label>
      <label>別のテスト明細CSV <input name="csv" type="file" accept=".csv,text/csv"></label>
      </fieldset>
      <button>更新</button>
    </form>
    <p role="alert"></p><div id="results"></div>`;
  const form = root.querySelector("form")!;
  if (!preview) {
    root.querySelector("#sample")!.remove();
    root.querySelector("small")!.remove();
    form.querySelector("button")!.remove();
  }
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  if (preview) {
    input("start").value = coverage.start;
    input("end").value = coverage.end;
  }
  const output = root.querySelector("#results")!;
  const error = root.querySelector("[role=alert]")!;
  let revision = 0;
  async function refresh() {
    const current = ++revision;
    output.replaceChildren();
    error.textContent = "";
    const jsonFile = input("json").files?.[0];
    try {
      if (jsonFile) {
        let data: unknown;
        try {
          data = JSON.parse(await jsonFile.text());
        } catch {
          throw new Error("JSONファイルを読み込めません。形式を確認してください。");
        }
        if (current === revision) output.replaceChildren(results(analyze(readValuations(data), [], null)));
        return;
      }
      if (!preview) return;
      const file = input("csv").files?.[0];
      const range = { start: input("start").value, end: input("end").value };
      const text = file ? decodeCsv(await file.arrayBuffer()) : sampleCsv;
      if (current !== revision) return;
      output.replaceChildren(results(analyze(valuations, readFlows(text, layout), range)));
    } catch (cause) {
      if (current === revision) error.textContent = cause instanceof Error ? cause.message : "読み込みに失敗しました。";
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); void refresh(); });
  input("json").addEventListener("change", () => {
    if (preview) root.querySelector<HTMLFieldSetElement>("#sample")!.disabled = Boolean(input("json").files?.length);
    void refresh();
  });
  container.append(host);
  void refresh();
}

if (location.origin === "https://site.sbisec.co.jp") {
  const sync = () => {
    const host = document.getElementById("sbi-my-assets-plus");
    if (location.pathname !== "/account/assets") {
      host?.remove();
    } else if (!host) {
      mountPanel(document.querySelector("main") ?? document.body, false);
    }
  };
  sync();
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", sync);
} else if (document.getElementById("preview-anchor") && !document.getElementById("sbi-my-assets-plus")) {
  mountPanel(document.body, true);
}
