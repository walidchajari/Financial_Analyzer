import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { AnalyzerResponse, PricePoint, RatioRow } from "../types/analyzer";
import { formatCompact, formatCurrency, formatNumber, formatPercent, formatSignedPercent } from "./format";

const PAGE_MARGIN = 42;
const SECTION_GAP = 26;
const HERO_HEIGHT = 170;
const DARK = { r: 15, g: 23, b: 42 };

const ensurePageSpace = (doc: jsPDF, cursor: number, minSpace = 120) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  const limit = pageHeight - PAGE_MARGIN;
  if (cursor + minSpace > limit) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return cursor;
};

const TABLE_STYLE = {
  styles: {
    fontSize: 10,
    cellPadding: { top: 6, bottom: 6, left: 5, right: 5 },
    lineColor: [226, 232, 240] as [number, number, number],
  },
  headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255, fontStyle: "bold" as const },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
};

const addHeading = (doc: jsPDF, title: string, y: number, subtitle?: string) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, PAGE_MARGIN, y);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 130, 150);
    doc.text(subtitle, PAGE_MARGIN, y + 14);
    doc.setTextColor(0, 0, 0);
    return y + 20;
  }
  return y + 12;
};

const addTableSection = (
  doc: jsPDF,
  startY: number,
  options: { title: string; subtitle?: string; head: string[][]; body: string[][] },
) => {
  const safeStart = ensurePageSpace(doc, startY, 140);
  const headingBottom = addHeading(doc, options.title, safeStart, options.subtitle);
  autoTable(doc, {
    startY: headingBottom + 4,
    head: options.head,
    body: options.body,
    theme: "striped",
    ...TABLE_STYLE,
  });
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (last?.finalY ?? headingBottom) + SECTION_GAP;
};

const addListSection = (doc: jsPDF, startY: number, title: string, items: string[]) => {
  const cleaned = items.filter(Boolean);
  if (!cleaned.length) return startY;
  const contentWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const bullets = cleaned.map((line) => doc.splitTextToSize(`• ${line}`, contentWidth));
  const estimatedHeight = bullets.reduce((sum, lines) => sum + lines.length * 14, 0) + SECTION_GAP / 2 + 22;
  let cursor = addHeading(doc, title, ensurePageSpace(doc, startY, estimatedHeight));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  bullets.forEach((lines) => {
    const limit = doc.internal.pageSize.getHeight() - PAGE_MARGIN;
    if (cursor + lines.length * 14 > limit) {
      doc.addPage();
      cursor = addHeading(doc, `${title} (suite)`, PAGE_MARGIN);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
    }
    doc.text(lines, PAGE_MARGIN, cursor);
    cursor += lines.length * 14;
  });
  return cursor + SECTION_GAP / 2;
};

const buildKeyRows = (analysis: AnalyzerResponse) => [
  ["Prix actuel", formatCurrency(analysis.key_data.prix_actuel, "USD")],
  ["EPS (TTM)", formatCurrency(analysis.key_data.EPS, "USD")],
  ["Croissance attendue", formatPercent(analysis.key_data.croissance)],
  ["Free Cash Flow", formatCompact(analysis.key_data.FCF)],
  ["Dette nette", formatCompact(analysis.key_data.dette)],
  ["Marge nette", formatPercent(analysis.key_data.marge)],
  ["ROE / ROA", `${formatPercent(analysis.key_data.ROE)} · ${formatPercent(analysis.key_data.ROA)}`],
  ["Payout ratio", formatPercent(analysis.key_data.payout_ratio)],
];

const sortHistory = (history?: PricePoint[]) =>
  (history || [])
    .filter(
      (point): point is PricePoint =>
        !!point &&
        typeof point.date === "string" &&
        Number.isFinite(new Date(point.date).getTime()) &&
        typeof point.close === "number" &&
        Number.isFinite(point.close),
    )
    .map((point) => ({ ...point, close: Number(point.close) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const perfBetween = (series: PricePoint[], startIndex: number, endIndex: number) => {
  const start = series[startIndex];
  const end = series[endIndex];
  if (!start || !end || !start.close) return null;
  return (end.close - start.close) / start.close;
};

const buildPerformanceRows = (history: PricePoint[], benchmark?: PricePoint[], benchmarkLabel = "SPY") => {
  if (!history.length) return [];
  const last = history.length - 1;
  const perf1y = perfBetween(history, 0, last);
  const perf3m = perfBetween(history, Math.max(0, history.length - 13), last);
  const perf1m = perfBetween(history, Math.max(0, history.length - 5), last);
  const rows: string[][] = [
    ["Performance 1 an", formatPercent(perf1y)],
    ["Performance 3 mois", formatPercent(perf3m)],
    ["Performance 1 mois", formatPercent(perf1m)],
  ];
  if (benchmark?.length) {
    const alpha = computeAlpha(history, benchmark);
    rows.push([`Alpha vs ${benchmarkLabel}`, formatPercent(alpha)]);
  }
  return rows;
};

const buildDcfRows = (analysis: AnalyzerResponse) => [
  ["WACC", formatPercent(analysis.dcf.wacc, 2)],
  ["FCF actualisé 5 ans", formatCompact(analysis.dcf.fcf_croissance_5y)],
  ["Valeur terminale", formatCompact(analysis.dcf.valeur_terminale)],
  ["Valeur intrinsèque", formatCurrency(analysis.dcf.valeur_intrinseque_action, "USD")],
  ["Comparaison marché", analysis.dcf.comparaison || "N/A"],
];

const buildScenarioRows = (analysis: AnalyzerResponse) => {
  const rows: string[][] = [];
  const block = analysis.dcf_scenarios;
  if (!block?.scenarios?.length) return rows;
  block.scenarios.forEach((scenario) => {
    rows.push([
      scenario.name,
      formatPercent(scenario.wacc),
      formatPercent(scenario.growth_rate),
      formatPercent(scenario.terminal_growth),
      formatCurrency(scenario.intrinsic_value, "USD"),
      formatPercent(scenario.weight),
    ]);
  });
  if (block.weighted_intrinsic_value !== null && block.weighted_intrinsic_value !== undefined) {
    rows.push(["Valeur pondérée", "-", "-", "-", formatCurrency(block.weighted_intrinsic_value, "USD"), ""]);
  }
  return rows;
};

const buildMonteCarloRows = (summary: AnalyzerResponse["monte_carlo"]) => {
  if (!summary || !summary.iterations) return [];
  return [
    ["Itérations", formatNumber(summary.iterations)],
    ["Médiane", formatCurrency(summary.median, "USD")],
    ["Minimum", formatCurrency(summary.min, "USD")],
    ["Maximum", formatCurrency(summary.max, "USD")],
  ];
};

const buildScoringRows = (analysis: AnalyzerResponse) => [
  ["Santé financière", `${formatNumber(analysis.scoring.sante_financiere)}/100`],
  ["Croissance", `${formatNumber(analysis.scoring.croissance)}/100`],
  ["Valorisation", `${formatNumber(analysis.scoring.valorisation)}/100`],
  ["Risque", `${formatNumber(analysis.scoring.risque)}/100`],
  ["Score total", `${formatNumber(analysis.scoring.score_total)}/100`],
];

const buildMultiplesRows = (ratios: RatioRow[]) =>
  ratios.map((ratio) => [
    ratio.ratio,
    formatNumber(ratio.value),
    formatNumber(ratio.sector),
    formatNumber(ratio.historic_5y),
    ratio.verdict,
  ]);

const buildAdvancedRows = (metrics: AnalyzerResponse["advanced_metrics"]) => [
  ["Return on Invested Capital", formatPercent(metrics.roic, 2), "Rendement du capital investi"],
  ["Free Cash Flow Yield", formatPercent(metrics.fcf_yield, 2), "FCF / Capitalisation"],
  ["Marge opérationnelle", formatPercent(metrics.operating_margin, 2), "Résultat net / Revenu"],
  [
    "Piotroski",
    metrics.piotroski_score !== null && metrics.piotroski_score !== undefined ? formatNumber(metrics.piotroski_score) : "N/A",
    "Score sur 9 (profitabilité, levier, efficience)",
  ],
  [
    "Altman Z-Score",
    metrics.z_score !== null && metrics.z_score !== undefined
      ? formatNumber(metrics.z_score, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
      : "N/A",
    "Risque de défaut financier",
  ],
];

type PredictionStat = {
  horizon: string;
  predicted: "UP" | "DOWN";
  confidence: number;
  expectedReturn: number | null;
  accuracy: number | null;
  sample: number;
  confusion: { tp: number; tn: number; fp: number; fn: number };
};

const buildPredictionRows = (history: PricePoint[], intrinsic: number | null | undefined) => {
  const horizons = [
    { id: "1w", label: "Horizon 1 semaine", lookback: 6, forward: 1 },
    { id: "4w", label: "Horizon 1 mois", lookback: 10, forward: 4 },
  ] as const;

  if (history.length < Math.min(...horizons.map((h) => h.lookback + h.forward))) {
    return { rows: [] as string[][], summary: [] as string[][] };
  }

  const equitySeries: { index: number; equity: number }[] = [];

  const stats: PredictionStat[] = horizons.map((config) => {
    const predictions: ("UP" | "DOWN")[] = [];
    const actuals: ("UP" | "DOWN" | null)[] = [];
    let equity = 1;
    const cost = 0.001;
    for (let idx = config.lookback; idx < history.length; idx++) {
      const window = history.slice(idx - config.lookback, idx + 1);
      const signal = computeDirectionalSignal(window, intrinsic);
      predictions.push(signal.direction);
      const base = history[idx];
      const target = history[idx + config.forward];
      const realized =
        target && base && base.close
          ? (target.close - base.close) / base.close
          : null;
      actuals.push(realized !== null && realized !== undefined ? (realized >= 0 ? "UP" : "DOWN") : null);
      if (config.id === "1w" && realized !== null && realized !== undefined) {
        const applied = signal.direction === "UP" ? realized : -realized;
        equity *= 1 + applied - cost;
        equitySeries.push({ index: idx, equity });
      }
    }

    const lastWindow = history.slice(-config.lookback);
    const liveSignal = computeDirectionalSignal(lastWindow, intrinsic);

    let right = 0;
    let total = 0;
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;
    actuals.forEach((actual, idx) => {
      if (actual === null) return;
      total += 1;
      if (actual === predictions[idx]) right += 1;
      if (predictions[idx] === "UP" && actual === "UP") tp += 1;
      if (predictions[idx] === "DOWN" && actual === "DOWN") tn += 1;
      if (predictions[idx] === "UP" && actual === "DOWN") fp += 1;
      if (predictions[idx] === "DOWN" && actual === "UP") fn += 1;
    });
    const accuracy = total ? right / total : null;

    return {
      horizon: config.label,
      predicted: liveSignal.direction,
      confidence: liveSignal.confidence,
      expectedReturn: liveSignal.expectedReturn,
      accuracy,
      sample: total,
      confusion: { tp, tn, fp, fn },
    };
  });

  const rows = stats.map((item) => [
    item.horizon,
    item.predicted === "UP" ? "Hausse anticipée" : "Baisse anticipée",
    formatPercent(item.confidence / 100, 1),
    formatPercent(item.expectedReturn, 2),
    item.accuracy !== null ? `${formatPercent(item.accuracy)} (n=${item.sample})` : "N/A",
  ]);

  const summary = stats.map((item) => [
    item.horizon,
    item.predicted === "UP" ? "UP" : "DOWN",
    `${item.confidence.toFixed(1)} %`,
    formatPercent(item.expectedReturn, 2),
    item.accuracy !== null ? `${formatPercent(item.accuracy)} · n=${item.sample}` : "n.d.",
  ]);

  const confusion = stats.map((item) => [
    item.horizon,
    formatNumber(item.confusion.tp),
    formatNumber(item.confusion.tn),
    formatNumber(item.confusion.fp),
    formatNumber(item.confusion.fn),
  ]);

  return { rows, summary, confusion, equitySeries };
};

const computeAlpha = (history: PricePoint[], benchmark: PricePoint[]) => {
  const own = computeSimpleReturn(history);
  const ref = computeSimpleReturn(benchmark);
  if (own === null || ref === null) return null;
  return own - ref;
};

const computeSimpleReturn = (series: PricePoint[]) => {
  if (!series.length) return null;
  const first = series[0]?.close;
  const last = series[series.length - 1]?.close;
  if (!first || !last) return null;
  return (last - first) / first;
};

const computeDirectionalSignal = (window: PricePoint[], intrinsicValue: number | null | undefined) => {
  const closes = window.map((point) => point.close).filter((value) => Number.isFinite(value)) as number[];
  if (closes.length < 3) {
    return { direction: "UP" as const, confidence: 55, expectedReturn: null };
  }
  const lastClose = closes[closes.length - 1];
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const change = (closes[i] - closes[i - 1]) / closes[i - 1];
    if (Number.isFinite(change)) returns.push(change);
  }
  const momentum = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const volatility =
    returns.length > 1
      ? Math.sqrt(returns.reduce((sum, value) => sum + Math.pow(value - momentum, 2), 0) / returns.length)
      : 0;
  const longTrend = closes.length >= 5 ? (lastClose - average(closes.slice(-5))) / average(closes.slice(-5)) : 0;
  const useGap = intrinsicValue !== null && intrinsicValue !== undefined && Math.abs(lastClose) > 1e-6;
  const valuationGap = useGap ? (intrinsicValue - lastClose) / lastClose : 0;
  const blended = 0.5 * momentum + 0.3 * valuationGap + 0.2 * longTrend;
  const direction: "UP" | "DOWN" = blended >= 0 ? "UP" : "DOWN";
  const magnitude = Math.min(0.15, Math.abs(blended));
  const baseConfidence = 0.55 + magnitude * 1.6;
  const penalty = Math.min(0.18, volatility * 2.2);
  const confidencePercent = Math.max(0.35, Math.min(0.92, baseConfidence - penalty)) * 100;
  const expectedReturn = Math.max(-0.25, Math.min(0.25, blended * 1.1));
  return { direction, confidence: Math.round(confidencePercent * 10) / 10, expectedReturn };
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const drawEquityCurve = (
  doc: jsPDF,
  startY: number,
  series: { index: number; equity: number }[],
  title = "Equity curve (paper trading 1w)",
) => {
  if (!series.length) return startY;
  const marginX = PAGE_MARGIN;
  const width = doc.internal.pageSize.getWidth() - marginX * 2;
  const height = 120;
  const minEq = Math.min(...series.map((s) => s.equity));
  const maxEq = Math.max(...series.map((s) => s.equity));
  const range = Math.max(0.01, maxEq - minEq);
  const points = series.map((s, idx) => {
    const x = marginX + (idx / Math.max(series.length - 1, 1)) * width;
    const y = startY + height - ((s.equity - minEq) / range) * height;
    return { x, y };
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, marginX, startY - 10);
  doc.setDrawColor(DARK.r, DARK.g, DARK.b);
  doc.setFillColor(52, 211, 153);
  points.forEach((p, idx) => {
    if (idx === 0) return;
    const prev = points[idx - 1];
    doc.line(prev.x, prev.y, p.x, p.y);
  });
  points.forEach((p) => {
    doc.circle(p.x, p.y, 2, "F");
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 130, 150);
  doc.text(`Min ${formatPercent((minEq ?? 1) - 1)}`, marginX, startY + height + 14);
  doc.text(`Max ${formatPercent((maxEq ?? 1) - 1)}`, marginX + 180, startY + height + 14);
  doc.setTextColor(0, 0, 0);
  return startY + height + SECTION_GAP / 2;
};

const drawHero = (doc: jsPDF, analysis: AnalyzerResponse) => {
  const { width } = doc.internal.pageSize;
  const boxWidth = width - PAGE_MARGIN * 2;
  const top = 78;
  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.roundedRect(PAGE_MARGIN, top, boxWidth, HERO_HEIGHT, 16, 16, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(`Financial Analyzer · ${analysis.ticker}`, PAGE_MARGIN + 20, top + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Verdict : ${analysis.verdict_final.etat}`, PAGE_MARGIN + 20, top + 52);
  doc.text(`Recommandation ${analysis.recommandation.signal} (${analysis.recommandation.horizon})`, PAGE_MARGIN + 20, top + 70);

  const stats = [
    { label: "Valeur intrinsèque", value: formatCurrency(analysis.dcf.valeur_intrinseque_action, "USD") },
    { label: "Prix spot", value: formatCurrency(analysis.key_data.prix_actuel, "USD") },
    {
      label: "Potentiel",
      value: (() => {
        const price = analysis.key_data.prix_actuel;
        const intrinsic = analysis.dcf.valeur_intrinseque_action;
        if (!price || !intrinsic || price === 0) return "N/A";
        return formatSignedPercent((intrinsic - price) / price);
      })(),
    },
  ];

  const cardW = (boxWidth - 60) / stats.length;
  stats.forEach((stat, index) => {
    const x = PAGE_MARGIN + 20 + index * (cardW + 20);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.roundedRect(x, top + 86, cardW, 56, 10, 10, "F");
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(stat.label, x + 10, top + 102);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(stat.value, x + 10, top + 120);
  });

  const summary = doc.splitTextToSize(analysis.verdict_final.explication, boxWidth - 40);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(summary, PAGE_MARGIN + 20, top + HERO_HEIGHT - 10);
  doc.setTextColor(0, 0, 0);
  return top + HERO_HEIGHT;
};

export function downloadAnalysisPdf(analysis: AnalyzerResponse) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const generatedAt = new Date().toLocaleString("fr-FR");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(`Rapport ${analysis.ticker}`, PAGE_MARGIN, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Généré le ${generatedAt}`, PAGE_MARGIN, 66);

  const heroBottom = drawHero(doc, analysis);
  let cursor = heroBottom + SECTION_GAP;

  const priceHistory = sortHistory(analysis.price_history);
  const benchmarkHistory = sortHistory(analysis.benchmark_history);

  const perfRows = buildPerformanceRows(priceHistory, benchmarkHistory, analysis.benchmark_ticker || "SPY");
  if (perfRows.length) {
    cursor = addTableSection(doc, cursor, {
      title: "Performance & Benchmark",
      subtitle: "Evolution du cours et alpha relatif",
      head: [["Indicateur", "Valeur"]],
      body: perfRows,
    });
  }

  cursor = addTableSection(doc, cursor, {
    title: "Données essentielles",
    subtitle: "Valorisation de marché, marges et ratios clés",
    head: [["Indicateur", "Valeur"]],
    body: buildKeyRows(analysis),
  });

  const predictionRows = buildPredictionRows(priceHistory, analysis.dcf.valeur_intrinseque_action);
  if (predictionRows.rows.length) {
    cursor = addTableSection(doc, cursor, {
      title: "Prédictions directionnelles",
      subtitle: "Momentum + écart DCF (1 semaine / 1 mois) avec backtest — indicatif, non garanti",
      head: [["Horizon", "Signal", "Confiance", "Mouvement attendu", "Précision backtest"]],
      body: predictionRows.rows,
    });
    cursor = addTableSection(doc, cursor, {
      title: "Matrice de confusion",
      subtitle: "TP = bonnes hausses, TN = bonnes baisses, FP/FN = erreurs",
      head: [["Horizon", "TP", "TN", "FP", "FN"]],
      body: predictionRows.confusion,
    });
    cursor = drawEquityCurve(doc, cursor + 10, predictionRows.equitySeries);
  }

  cursor = addTableSection(doc, cursor, {
    title: "Discounted Cash Flow",
    subtitle: "Hypothèses de base et comparaison au marché",
    head: [["Indicateur", "Valeur"]],
    body: buildDcfRows(analysis),
  });

  const scenarioRows = buildScenarioRows(analysis);
  if (scenarioRows.length) {
    cursor = addTableSection(doc, cursor, {
      title: "Scénarios pondérés",
      subtitle: "Bear · Base · Bull",
      head: [["Scénario", "WACC", "Croissance", "Terminale", "Valeur", "Poids"]],
      body: scenarioRows,
    });
  }

  const monteRows = buildMonteCarloRows(analysis.monte_carlo);
  if (monteRows.length) {
    cursor = addTableSection(doc, cursor, {
      title: "Simulation Monte Carlo",
      subtitle: "Distribution probabiliste",
      head: [["Mesure", "Valeur"]],
      body: monteRows,
    });
  }

  cursor = addTableSection(doc, cursor, {
    title: "Scores 360°",
    subtitle: "Santé · Croissance · Valorisation · Risque",
    head: [["Score", "Note"]],
    body: buildScoringRows(analysis),
  });

  cursor = addTableSection(doc, cursor, {
    title: "Multiples sectoriels",
    subtitle: "Comparaison au secteur et à l'historique",
    head: [["Ratio", "Valeur", "Secteur", "Historique", "Verdict"]],
    body: buildMultiplesRows(analysis.multiples_analysis),
  });

  cursor = addTableSection(doc, cursor, {
    title: "Ratios avancés",
    subtitle: "Qualité du business, rendement et risque",
    head: [["Métrique", "Valeur", "Lecture"]],
    body: buildAdvancedRows(analysis.advanced_metrics),
  });

  cursor = addTableSection(doc, cursor, {
    title: "Recommandation",
    subtitle: "Signal · Horizon · Verdict",
    head: [["Champ", "Détail"]],
    body: [
      ["Signal", analysis.recommandation.signal],
      ["Horizon", analysis.recommandation.horizon],
      ["Verdict", analysis.verdict_final.etat],
    ],
  });

  cursor = addListSection(doc, cursor, "Résumé investisseur", analysis.resume_investisseur.split("\n"));
  cursor = addListSection(doc, cursor, "Catalyseurs clés", analysis.recommandation.principaux_catalyseurs || []);
  cursor = addListSection(doc, cursor, "Risques principaux", analysis.recommandation.principaux_risques || []);
  cursor = addListSection(doc, cursor, "Notes Discounted Cash Flow", analysis.dcf.notes || []);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 130, 150);
    doc.text(`Page ${page}/${totalPages}`, doc.internal.pageSize.getWidth() - PAGE_MARGIN, doc.internal.pageSize.getHeight() - 20, {
      align: "right",
    });
  }

  doc.save(`analyse-${analysis.ticker}.pdf`);
  return cursor;
}
