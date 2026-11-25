import type { Point } from "./analytics.ts";

type Series = {
  key: "value" | "baseline" | "profit" | "adjustedValue" | "provisionalAdjustedValue";
  label: string;
  color: string;
  dash: number[];
  marker: "circle" | "square" | "triangle" | "diamond" | "cross";
};
export const provisionalSeries: Series = {
  key: "provisionalAdjustedValue", label: "暫定資産額（分類済みの入出金のみ）",
  color: "#565656", dash: [10, 3, 2, 3], marker: "cross"
};
export const series: Series[] = [
  { key: "value", label: "資産評価額", color: "#006BA6", dash: [5, 4], marker: "circle" },
  { key: "baseline", label: "入出金調整後の基準額", color: "#A54B00", dash: [14, 5], marker: "square" },
  { key: "profit", label: "累積運用損益", color: "#007264", dash: [2, 4], marker: "triangle" },
  { key: "adjustedValue", label: "入出金を除いた資産額", color: "#171717", dash: [], marker: "diamond" }
];

function lineStyle(g: CanvasRenderingContext2D, line: Series) {
  g.strokeStyle = line.color;
  g.lineWidth = line.marker === "diamond" ? 3 : 2;
  g.setLineDash(line.dash);
}

function drawMarker(g: CanvasRenderingContext2D, line: Series, x: number, y: number) {
  const r = 4;
  g.setLineDash([]);
  g.lineWidth = 2;
  g.beginPath();
  switch (line.marker) {
    case "circle": g.arc(x, y, r, 0, 2 * Math.PI); break;
    case "square": g.rect(x - r, y - r, 2 * r, 2 * r); break;
    case "triangle":
      g.moveTo(x, y - r - 1); g.lineTo(x + r + 1, y + r); g.lineTo(x - r - 1, y + r); g.closePath(); break;
    case "diamond":
      g.moveTo(x, y - r - 1); g.lineTo(x + r + 1, y); g.lineTo(x, y + r + 1); g.lineTo(x - r - 1, y); g.closePath(); break;
    case "cross":
      g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x - r, y + r); g.lineTo(x + r, y - r); break;
  }
  if (line.marker !== "cross") {
    g.fillStyle = line.marker === "diamond" ? line.color : "#fff";
    g.fill();
  }
  g.stroke();
}

export function chart(points: Point[], lines: Series[]) {
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  const amounts = lines.map(line => {
    const item = document.createElement("span");
    const sample = document.createElement("canvas");
    sample.width = 112; sample.height = 36;
    sample.setAttribute("aria-hidden", "true");
    const context = sample.getContext("2d");
    if (context) {
      context.scale(2, 2);
      lineStyle(context, line);
      context.beginPath(); context.moveTo(1, 9); context.lineTo(55, 9); context.stroke();
      drawMarker(context, line, 28, 9);
    }
    const amount = document.createElement("strong");
    item.append(sample, line.label + " ", amount);
    caption.append(item);
    return amount;
  });
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", lines.map(line => line.label).join("、") + "の時系列。金額は日別明細でも確認できます。");
  canvas.setAttribute("role", "img");
  figure.append(caption, canvas);
  const width = 760, height = 210;
  canvas.width = width * 2;
  canvas.height = height * 2;
  const g = canvas.getContext("2d");
  if (!g || !points.length) return figure;
  g.scale(2, 2);
  let min = Infinity, max = -Infinity;
  for (const point of points) {
    for (const { key } of lines) {
      const n = point[key];
      if (n !== null) { min = Math.min(min, n); max = Math.max(max, n); }
    }
  }
  if (!Number.isFinite(min)) {
    g.fillText("算出可能な評価点がありません", 15, 40);
    return figure;
  }
  if (min === max) { min -= 1; max += 1; }
  const left = 105, right = width - 25;
  const top = 18, bottom = height - 29;
  const first = Date.parse(points[0].date), last = Date.parse(points[points.length - 1].date);
  const x = (date: string) => first === last ? (left + right) / 2 :
    left + (Date.parse(date) - first) / (last - first) * (right - left);
  const positions = points.map(point => x(point.date));
  const plot = document.createElement("div");
  plot.style.position = "relative";
  canvas.style.display = "block";
  const marker = document.createElement("div");
  marker.style.cssText = "position:absolute;width:1px;background:#53636c;opacity:.55;pointer-events:none";
  marker.style.top = (top / height * 100) + "%";
  marker.style.bottom = ((height - bottom) / height * 100) + "%";
  plot.append(canvas, marker);
  const dateLabel = document.createElement("label");
  const dates = document.createElement("select");
  for (const point of points) dates.add(new Option(point.date, point.date));
  dateLabel.append("評価日 ", dates);
  figure.append(plot, dateLabel);
  function selectPoint(index: number) {
    dates.selectedIndex = index;
    marker.style.left = (positions[index] / width * 100) + "%";
    for (const [i, line] of lines.entries()) {
      const amount = points[index][line.key];
      amounts[i].textContent = amount === null ? "—" : amount.toLocaleString("ja-JP") + " 円";
    }
  }
  selectPoint(points.length - 1);
  dates.addEventListener("change", () => selectPoint(dates.selectedIndex));
  function inspect(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const target = (event.clientX - rect.left) / rect.width * width;
    const nearest = positions.reduce((best, value, index) =>
      Math.abs(value - target) < Math.abs(positions[best] - target) ? index : best, 0);
    if (nearest !== dates.selectedIndex) selectPoint(nearest);
  }
  canvas.addEventListener("pointermove", inspect);
  canvas.addEventListener("pointerdown", inspect);
  const y = (yen: number) => bottom - (yen - min) / (max - min) * (bottom - top);
  g.font = "13px sans-serif";
  g.fillStyle = "#374151";
  g.textAlign = "right";
  for (const tick of [min, (min + max) / 2, max]) {
    g.fillText(Math.round(tick).toLocaleString("ja-JP") + " 円", left - 8, y(tick) + 4);
    g.strokeStyle = "#d9dfe3";
    g.beginPath(); g.moveTo(left, y(tick)); g.lineTo(right, y(tick)); g.stroke();
  }
  g.textAlign = "left";
  g.fillText(points[0].date, left, height - 6);
  if (last !== first) {
    g.textAlign = "right";
    g.fillText(points[points.length - 1].date, right, height - 6);
  }
  for (const line of lines) {
    lineStyle(g, line);
    g.beginPath();
    let contiguous = false;
    for (const point of points) {
      const value = point[line.key];
      if (value === null) { contiguous = false; continue; }
      if (contiguous) g.lineTo(x(point.date), y(value));
      else g.moveTo(x(point.date), y(value));
      contiguous = true;
    }
    g.stroke();
    let lastMarker = -Infinity;
    for (const [i, point] of points.entries()) {
      const value = point[line.key];
      if (value === null) continue;
      const endOfSegment = i === points.length - 1 || points[i + 1][line.key] === null;
      const startOfSegment = i === 0 || points[i - 1][line.key] === null;
      if (startOfSegment || endOfSegment || positions[i] - lastMarker >= 44) {
        drawMarker(g, line, positions[i], y(value));
        lastMarker = positions[i];
      }
    }
  }
  return figure;
}
