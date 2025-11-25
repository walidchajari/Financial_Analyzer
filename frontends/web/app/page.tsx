"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AdvancedMetrics,
  AnalyzerResponse,
  DcfScenarioBlock,
  KeyData,
  NullableNumber,
  MonteCarloSummary,
  PricePoint,
  NewsItem,
  RatioRow,
} from "@/types/analyzer";
import {
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { downloadAnalysisPdf } from "@/lib/pdf";
import { GlassCard } from "./components/GlassCard";
import { SectionHeading } from "./components/SectionHeading";

type FormOverrides = Record<
  "price" | "eps" | "growth_rate" | "book_value_per_share" | "shares_outstanding" | "free_cash_flow",
  string
>;

type MarketOption = "global" | "casablanca";

type FormState = {
  ticker: string;
  wacc: string;
  terminalGrowth: string;
  sector: string;
  overrides: FormOverrides;
  market: MarketOption;
};

type ChatMessage = {
  role: "user" | "bot";
  content: string;
};

type AlertItem = {
  id: string;
  ticker: string;
  metric: string;
  operator: string;
  threshold: number;
  note?: string | null;
  timestamp?: number;
};

type AlertFormState = {
  ticker: string;
  metric: string;
  operator: string;
  threshold: string;
  note: string;
};

const INITIAL_FORM: FormState = {
  ticker: "AAPL",
  wacc: "",
  terminalGrowth: "",
  sector: "",
  market: "global",
  overrides: {
    price: "",
    eps: "",
    growth_rate: "",
    book_value_per_share: "",
    shares_outstanding: "",
    free_cash_flow: "",
  },
};

const HERO_PILLS = [
  "Discounted Cash Flow simplifié",
  "Multiples sectoriels",
  "Scoring 360°",
  "Recommandation narrative",
];

const OVERRIDE_CONFIG = [
  { key: "price", label: "Prix actuel", placeholder: "190" },
  { key: "eps", label: "Earnings per Share (TTM)", placeholder: "6.42" },
  { key: "growth_rate", label: "Croissance attendue (%)", placeholder: "12" },
  { key: "book_value_per_share", label: "Valeur comptable par action", placeholder: "4.5" },
  { key: "shares_outstanding", label: "Actions en circulation", placeholder: "15000000000" },
  { key: "free_cash_flow", label: "Free Cash Flow", placeholder: "92000000000" },
] as const;

const SCENARIO_PRESETS = {
  defensive: { label: "Défensif", weights: { Bear: 0.4, Base: 0.4, Bull: 0.2 } },
  balanced: { label: "Équilibré", weights: { Bear: 0.25, Base: 0.5, Bull: 0.25 } },
  aggressive: { label: "Agressif", weights: { Bear: 0.2, Base: 0.4, Bull: 0.4 } },
} as const;

type ScenarioPreset = keyof typeof SCENARIO_PRESETS;

const verdictColor = (verdict: string) => {
  if (verdict.toLowerCase().includes("sous")) {
    return "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  }
  if (verdict.toLowerCase().includes("sur")) {
    return "border border-rose-400/40 bg-rose-500/15 text-rose-200";
  }
  if (verdict.toLowerCase().includes("donnée")) {
    return "border border-slate-300/30 bg-white/10 text-white";
  }
  return "border border-amber-400/40 bg-amber-500/15 text-amber-200";
};

const parseInputNumber = (raw?: string) => {
  if (!raw) return undefined;
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeRate = (value?: number) => {
  if (value === undefined) return undefined;
  return value > 1 ? value / 100 : value;
};

const NAV_ITEMS = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "price", label: "Cours & historique" },
  { id: "predictions", label: "Prévisions" },
  { id: "news", label: "News" },
  { id: "dcf", label: "Discounted Cash Flow & Scénarios" },
  { id: "multiples", label: "Multiples" },
  { id: "scoring", label: "Scores" },
  { id: "verdict", label: "Verdict" },
] as const;

function HeaderBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-white sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-slate-900 font-black text-lg">FA</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">Analyste Financier</p>
            <p className="text-base font-semibold">Financial Analyzer | Tableau de bord Discounted Cash Flow</p>
          </div>
        </div>
        <div className="hidden items-center gap-4 text-sm font-medium text-white/80 md:flex">
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-100 border border-emerald-500/30">Next.js</span>
          <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-100 border border-sky-500/30">TailwindCSS</span>
          <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-indigo-100 border border-indigo-500/30">React</span>
        </div>
      </div>
    </header>
  );
}

function QuickNav() {
  return (
    <nav className="hidden lg:block lg:w-56 text-white/80">
      <div className="sticky top-24 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Navigation</p>
        <ul className="space-y-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="flex items-center gap-2 rounded-2xl px-3 py-2 transition hover:bg-emerald-400/10 hover:text-white"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [analysis, setAnalysis] = useState<AnalyzerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scenarioPreset, setScenarioPreset] = useState<ScenarioPreset>("balanced");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertForm, setAlertForm] = useState<AlertFormState>({
    ticker: INITIAL_FORM.ticker,
    metric: "prix",
    operator: ">=",
    threshold: "",
    note: "",
  });

  const resumeLines = useMemo(
    () => (analysis?.resume_investisseur ? analysis.resume_investisseur.split("\n").filter(Boolean) : []),
    [analysis],
  );

  const multiplesReady = useMemo(() => {
    if (!analysis) return false;
    return analysis.multiples_analysis.some((ratio) => ratio.value);
  }, [analysis]);

  useEffect(() => {
    setChatMessages([]);
  }, [analysis?.ticker]);

  const timeline = useMemo(() => {
    if (!analysis) {
      return [
        { title: "Collecte Yahoo Finance", status: "pending", description: "En attente de votre premier ticker." },
        { title: "Analyse des multiples", status: "idle", description: "Comparaison secteur et historique." },
        { title: "Discounted Cash Flow & Scoring", status: "idle", description: "Projection des flux et score qualité." },
        { title: "Verdict final", status: "idle", description: "Recommandation attachée à un horizon." },
      ];
    }
    return [
      { title: "Collecte Yahoo Finance", status: "done", description: `${analysis.ticker} chargé.` },
      {
        title: "Analyse des multiples",
        status: multiplesReady ? "done" : "warning",
        description: multiplesReady ? "Ratios calculés" : "Multiples incomplets",
      },
      {
        title: "Discounted Cash Flow & Scoring",
        status: analysis.dcf.valeur_intrinseque_action ? "done" : "warning",
        description: analysis.dcf.valeur_intrinseque_action
          ? "Valeur intrinsèque estimée"
          : "Données manquantes pour le Discounted Cash Flow",
      },
      {
        title: "Verdict final",
        status: "done",
        description: `${analysis.verdict_final.etat} — ${analysis.recommandation.signal}`,
      },
    ];
  }, [analysis, multiplesReady]);

  const heroStats = useMemo(() => {
    if (!analysis) {
      return [
        { label: "Pipeline", value: "Prêt", hint: "Lancez votre première analyse" },
        { label: "Discounted Cash Flow", value: "—", hint: "Valeur intrinsèque en attente" },
        { label: "Score", value: "— / 100", hint: "Santé · Croissance · Valorisation · Risque" },
      ];
    }
    const intrinsic = analysis.dcf.valeur_intrinseque_action;
    const price = analysis.key_data.prix_actuel;
    const gap = intrinsic && price ? ((price - intrinsic) / intrinsic) * 100 : null;
    return [
      { label: "Score global", value: `${Math.round(analysis.scoring.score_total)} / 100`, hint: "Synthèse qualitative 360°" },
      { label: "Valeur intrinsèque", value: formatCurrency(intrinsic, "USD"), hint: "Discounted Cash Flow – scénario de base" },
      {
        label: "Écart marché",
        value: gap !== null ? `${gap > 0 ? "+" : ""}${gap.toFixed(1)} %` : "N/A",
        hint: price && intrinsic ? `Prix spot ${formatCurrency(price, "USD")}` : "Données à compléter",
      },
    ];
  }, [analysis]);

  const priceHistory = useMemo(() => {
    if (!analysis?.price_history?.length) return [];
    return [...analysis.price_history]
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
  }, [analysis?.price_history]);

  const benchmarkHistory = useMemo(() => {
    if (!analysis?.benchmark_history?.length) return [];
    return [...analysis.benchmark_history]
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
  }, [analysis?.benchmark_history]);

  const predictionBundle = useMemo(
    () =>
      buildPredictions(
        priceHistory,
        benchmarkHistory,
        analysis?.dcf?.valeur_intrinseque_action ?? null,
        analysis?.benchmark_ticker ?? "SPY",
        analysis?.macro_risk?.vix ?? null,
      ),
    [priceHistory, benchmarkHistory, analysis?.dcf?.valeur_intrinseque_action, analysis?.benchmark_ticker, analysis?.macro_risk?.vix],
  );

  const news = useMemo(() => {
    if (!analysis?.news?.length) return [];
    return analysis.news
      .filter((item): item is NewsItem => !!item && typeof item.title === "string" && typeof item.link === "string")
      .slice(0, 8);
  }, [analysis?.news]);

  const scenarioData = useMemo(
    () => analysis?.dcf_scenarios?.scenarios ?? [],
    [analysis?.dcf_scenarios?.scenarios],
  );
  const customScenarioValue = useMemo(() => {
    if (!scenarioData.length) return null;
    const preset = SCENARIO_PRESETS[scenarioPreset];
    let total = 0;
    scenarioData.forEach((scenario) => {
      const weight = preset.weights[scenario.name as keyof typeof preset.weights] ?? scenario.weight ?? 0;
      if (scenario.intrinsic_value) {
        total += weight * scenario.intrinsic_value;
      }
    });
    return total || null;
  }, [scenarioData, scenarioPreset]);

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      [field]: field === "ticker" ? value.toUpperCase() : value,
    }));
  };

  const handleOverrideChange = (key: keyof FormOverrides) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        [key]: value,
      },
    }));
  };

  const handleCopy = async () => {
    if (!analysis || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = useCallback(() => {
    if (!analysis || pdfGenerating) return;
    try {
      setPdfGenerating(true);
      downloadAnalysisPdf(analysis);
    } catch (err) {
      console.error(err);
      setError("Impossible de générer le PDF.");
    } finally {
      setPdfGenerating(false);
    }
  }, [analysis, pdfGenerating]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.market === "casablanca") {
      setError("Le mode Bourse de Casablanca arrive bientôt. Utilisez un ticker Yahoo Finance pour le moment.");
      return;
    }
    setLoading(true);
    setError(null);

    const waccValue = parseInputNumber(form.wacc);
    const terminalValue = parseInputNumber(form.terminalGrowth);

    const overridesPayload: Record<string, number> = {};
    OVERRIDE_CONFIG.forEach(({ key }) => {
      const value = parseInputNumber(form.overrides[key]);
      if (value === undefined) {
        return;
      }
      overridesPayload[key] = key === "growth_rate" ? normalizeRate(value) ?? value : value;
    });

    const payload: Record<string, unknown> = {
      ticker: form.ticker.trim().toUpperCase(),
    };
    const normalizedWacc = normalizeRate(waccValue);
    const normalizedTerminal = normalizeRate(terminalValue);
    if (normalizedWacc !== undefined) payload.wacc = normalizedWacc;
    if (normalizedTerminal !== undefined) payload.terminalGrowth = normalizedTerminal;
    if (form.sector.trim()) payload.sector = form.sector.trim();
    if (Object.keys(overridesPayload).length) {
      payload.overrides = overridesPayload;
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Analyse impossible.");
      }
      if (json.erreur) {
        setError(json.erreur);
        setAnalysis(null);
      } else {
        setAnalysis(json as AnalyzerResponse);
      }
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    setChatLoading(true);
    const response = generateChatbotResponse(question, analysis);
    setChatMessages((prev) => [...prev, { role: "user", content: question }, { role: "bot", content: response }]);
    setChatInput("");
    setChatLoading(false);
  };

  const refreshAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertError(null);
    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.detail || json?.error || "Impossible de charger les alertes.");
      }
      setAlerts(Array.isArray(json.alerts) ? json.alerts : []);
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : "Impossible de charger les alertes.");
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  useEffect(() => {
    setAlertForm((prev) => ({ ...prev, ticker: form.ticker }));
  }, [form.ticker]);

  const handleCreateAlert = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const thresholdValue = parseInputNumber(alertForm.threshold);
    if (thresholdValue === undefined) {
      setAlertError("Merci de saisir un seuil numérique valide.");
      return;
    }
    const payload = {
      ticker: alertForm.ticker.trim().toUpperCase(),
      metric: alertForm.metric,
      operator: alertForm.operator,
      threshold: thresholdValue,
      note: alertForm.note.trim() || undefined,
    };
    setAlertsLoading(true);
    setAlertError(null);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.detail || json?.error || "Impossible de créer l'alerte.");
      }
      setAlertForm((prev) => ({ ...prev, threshold: "", note: "" }));
      refreshAlerts();
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : "Impossible de créer l'alerte.");
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    setAlertsLoading(true);
    setAlertError(null);
    try {
      const response = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.detail || json?.error || "Suppression impossible.");
      }
      refreshAlerts();
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setAlertsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.2),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[60rem] -translate-x-1/2 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_70%)] blur-3xl" />
      <HeaderBar />
      <main className="relative mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
        <section id="hero" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-950 p-8 shadow-[0_20px_120px_-60px_rgba(16,185,129,0.8)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
              <div className="relative space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200/80">Analyste financier</p>
                    <h1 className="mt-2 text-3xl font-semibold">Tableau de bord Discounted Cash Flow augmenté</h1>
                    <p className="text-white/70">Collecte en direct, multiples sectoriels, scénarios pondérés et score narratif.</p>
                  </div>
                  <span className="rounded-full border border-white/30 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
                    Beta privée
                  </span>
                </div>
                {analysis ? (
                  <div className="grid gap-4 rounded-3xl border border-white/15 bg-white/5 p-4 text-sm text-white/80 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Analyse active</p>
                      <p className="text-2xl font-semibold text-white">{analysis.ticker}</p>
                      <p className="text-sm text-white/70">{analysis.verdict_final.etat}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Recommandation</p>
                      <p className="text-2xl font-semibold text-white">{analysis.recommandation.signal}</p>
                      <p className="text-sm text-white/70">{analysis.recommandation.horizon}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-white/80">
                    Lancez une première recherche pour matérialiser automatiquement les graphiques, scores et PDF.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {HERO_PILLS.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {heroStats.map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-white/60">{stat.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                      <p className="text-xs text-white/70">{stat.hint}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    form="analysis-form"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
                  >
                    Déclencher une analyse
                  </button>
                  {analysis && (
                    <>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-sm font-medium text-white/90 transition hover:border-white hover:text-white"
                      >
                        {copied ? "JSON copié ✅" : "Copier le JSON brut"}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={pdfGenerating}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-2 text-sm font-medium text-white/80 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pdfGenerating ? "Génération..." : "Télécharger le PDF"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <GlassCard
              className="border-white/10 bg-white text-slate-900 shadow-2xl ring-1 ring-white/40"
              title="Paramétrer l'analyse"
              description="Choisissez un ticker Yahoo Finance, ajustez les hypothèses clefs et lancez le moteur."
            >
              <form id="analysis-form" className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Ticker</label>
                    <input
                      type="text"
                      value={form.ticker}
                      onChange={handleChange("ticker")}
                      placeholder="AAPL"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 font-mono uppercase tracking-wide focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Coût moyen pondéré du capital (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={form.wacc}
                        onChange={handleChange("wacc")}
                        placeholder="8"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 focus:border-emerald-400 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-slate-400">Laissez vide pour utiliser la valeur par défaut.</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Croissance terminale (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={form.terminalGrowth}
                        onChange={handleChange("terminalGrowth")}
                        placeholder="2.5"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 focus:border-emerald-400 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-slate-400">Laissez vide pour utiliser la valeur par défaut.</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Secteur</label>
                    <input
                      type="text"
                      value={form.sector}
                      onChange={handleChange("sector")}
                      placeholder="Technology"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-3 text-sm font-semibold">
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl border px-4 py-2 ${
                        form.market === "global"
                          ? "border-emerald-400 bg-emerald-400/10 text-emerald-700"
                          : "border-slate-200 text-slate-500"
                      }`}
                      onClick={() => setForm((prev) => ({ ...prev, market: "global" }))}
                    >
                      Marchés globaux
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-2xl border px-4 py-2 ${
                        form.market === "casablanca"
                          ? "border-emerald-400 bg-emerald-400/10 text-emerald-700"
                          : "border-slate-200 text-slate-500"
                      }`}
                      onClick={() => setForm((prev) => ({ ...prev, market: "casablanca" }))}
                    >
                      Casablanca (bientôt)
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700"
                  >
                    {showAdvanced ? "Masquer les overrides" : "Saisir des overrides manuels"}
                  </button>
                  {showAdvanced && (
                    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">
                        Remplissez uniquement les champs que vous souhaitez imposer (les croissances sont en %).
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {OVERRIDE_CONFIG.map(({ key, label, placeholder }) => (
                          <div key={key}>
                            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</label>
                            <input
                              type="text"
                              value={form.overrides[key]}
                              onChange={handleOverrideChange(key)}
                              placeholder={placeholder}
                              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? "Analyse en cours..." : "Lancer l'analyse"}
                  </button>
                </form>
              </GlassCard>
            </div>
          </section>

          {error && (
            <div className="mt-6 rounded-3xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-50 shadow-lg">
              <p className="text-base font-semibold text-white">Impossible de compléter l&apos;analyse</p>
              <p className="opacity-90">{error}</p>
            </div>
          )}

        <div className="mt-12 grid gap-8 lg:grid-cols-[260px,1fr]">
          <QuickNav />
          <div className="space-y-10">
            <section id="overview" className="grid gap-6 lg:grid-cols-[1.25fr,1fr]">
              <GlassCard className="border-white/10 bg-white/5 text-white">
                <SectionHeading kicker="Pipeline" title="Étapes de l'analyse" subtitle="Collecte → Multiples → DCF → Verdict" tone="dark" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {timeline.map((item) => (
                    <TimelineItem key={item.title} {...item} />
                  ))}
                </div>
              </GlassCard>
              {analysis ? (
                <KeyMetrics keyData={analysis.key_data} ticker={analysis.ticker} variant="dark" />
              ) : (
                <GlassCard className="border-white/10 bg-white/5 text-white">
                  <p className="text-sm text-white/70">Lancez une analyse pour afficher les données clés.</p>
                </GlassCard>
              )}
            </section>

            {analysis ? (
              <>
                <section id="price">
                  <PriceHistorySection
                    priceHistory={priceHistory}
                    ticker={analysis.ticker}
                    currentPrice={analysis.key_data.prix_actuel}
                  />
                </section>

                <section id="predictions" className="space-y-6">
                  <PredictionSection
                    bundle={predictionBundle}
                    ticker={analysis.ticker}
                    intrinsicValue={analysis.dcf.valeur_intrinseque_action}
                    benchmarkLabel={analysis.benchmark_ticker || "SPY"}
                  />
                  <AlertsCard
                    alerts={alerts}
                    loading={alertsLoading}
                    error={alertError}
                    form={alertForm}
                    setForm={setAlertForm}
                    onSubmit={handleCreateAlert}
                    onDelete={handleDeleteAlert}
                  />
                </section>

                <section id="dcf" className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
                  <DcfCard dcf={analysis.dcf} />
                  <ScenarioSection
                    scenarios={analysis.dcf_scenarios}
                    preset={scenarioPreset}
                    setPreset={setScenarioPreset}
                    customValue={customScenarioValue}
                    backendWeighted={analysis.dcf_scenarios?.weighted_intrinsic_value ?? null}
                    monteCarlo={analysis.monte_carlo}
                  />
                </section>

                <section id="multiples" className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
                  <Ratios multiples={analysis.multiples_analysis} />
                  <AdvancedMetricsSection metrics={analysis.advanced_metrics} />
                </section>

                <section id="news">
                  <NewsSection news={news} ticker={analysis.ticker} />
                </section>

                <section id="scoring" className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
                  <Scoring scoring={analysis.scoring} />
                  <KeyMetrics keyData={analysis.key_data} ticker={analysis.ticker} variant="dark" />
                </section>

                <section id="verdict" className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
                  <VerdictSection analysis={analysis} resumeLines={resumeLines} />
                  <NotesCard title="Résumé investisseur & Notes" items={[...resumeLines, ...analysis.key_data.notes]} />
                </section>
                <section id="assistant" className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
                  <GlassCard className="border-white/10 bg-white/5 text-white">
                    <SectionHeading
                      kicker="Assistant"
                      title="Chatbot quantitatif"
                      subtitle="Posez vos questions sur le rapport"
                      tone="dark"
                    />
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 max-h-64 overflow-y-auto space-y-3">
                      {chatMessages.length ? (
                        chatMessages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}-${message.content.slice(0,20)}`}
                            className={`rounded-2xl px-3 py-2 ${message.role === "user" ? "bg-emerald-500/20 text-white" : "bg-white/10 text-white/80"}`}
                          >
                            <p className="text-xs uppercase tracking-[0.3em] text-white/60">{message.role === "user" ? "Vous" : "Assistant"}</p>
                            <p>{message.content}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-white/60">Aucune conversation pour le moment. Posez une question pour démarrer.</p>
                      )}
                    </div>
                    <form onSubmit={handleSendChat} className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder={analysis ? `Question sur ${analysis.ticker}` : "Lancez d'abord une analyse"}
                        className="flex-1 rounded-2xl border border-white/20 bg-transparent px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-emerald-300 focus:outline-none"
                        disabled={!analysis}
                      />
                      <button
                        type="submit"
                        disabled={!analysis || chatLoading}
                        className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {chatLoading ? "Réponse..." : "Envoyer"}
                      </button>
                    </form>
                  </GlassCard>
                  <div className="space-y-4">
                    <NotesCard
                      title="Questions fréquentes"
                      items={[
                        "Quelle est la différence entre le prix spot et la valeur intrinsèque ?",
                        "Quels sont les catalyseurs principaux du scénario Bull ?",
                        "Quel est le score de risque et comment le lire ?",
                      ]}
                      fallback=""
                    />
                  </div>
                </section>
              </>
            ) : (
              <PlaceholderSection />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

type FactorBreakdown = {
  label: string;
  weight: number;
  value: number;
  contribution: number;
  hint: string;
};

type ConfusionCounts = {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
};

type PredictionStats = {
  id: string;
  label: string;
  accuracy: NullableNumber;
  total: number;
  confusion: ConfusionCounts;
};

type DirectionPrediction = {
  targetDate: string;
  label: string;
  predicted: "UP" | "DOWN";
  actual: "UP" | "DOWN" | null;
  status: "PENDING" | "RIGHT" | "WRONG";
  confidence: number;
  expectedReturn: NullableNumber;
  realizedReturn: NullableNumber;
  horizonLabel: string;
  horizonId: string;
  factors: FactorBreakdown[];
  expectedRange: { low: NullableNumber; high: NullableNumber };
  regime: "trend" | "mean_revert";
  topDriver?: string;
};

type PredictionBundle = {
  rows: DirectionPrediction[];
  stats: PredictionStats[];
  alphaVsBenchmark: NullableNumber;
  benchmarkLabel: string;
  paperTrading: NullableNumber;
};

type DirectionalSignal = {
  direction: "UP" | "DOWN";
  confidence: number;
  expectedReturn: NullableNumber;
  expectedRange: { low: NullableNumber; high: NullableNumber };
  regime: "trend" | "mean_revert";
  topDriver?: string;
  factors: FactorBreakdown[];
};

function PredictionSection({
  bundle,
  ticker,
  intrinsicValue,
  benchmarkLabel,
}: {
  bundle: PredictionBundle;
  ticker: string;
  intrinsicValue: NullableNumber;
  benchmarkLabel?: string | null;
}) {
  if (!bundle.rows.length) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
        <SectionHeading
          kicker="Signal directionnel"
          title="Prédictions indisponibles"
          subtitle="Un peu d'historique de prix est nécessaire pour calculer la tendance"
          tone="dark"
        />
        <p className="text-sm text-white/70">
          Lancez une analyse sur un ticker avec au moins 6 points hebdomadaires pour activer la prévision courte période.
        </p>
      </section>
    );
  }

  const rows = bundle.rows;
  const completed = rows.filter((row) => row.status !== "PENDING");
  const globalAccuracy = completed.length
    ? completed.filter((row) => row.status === "RIGHT").length / completed.length
    : null;
  const tickerReliability = bundle.stats
    .filter((stat) => stat.accuracy !== null && stat.total > 0)
    .reduce((sum, stat) => sum + (stat.accuracy || 0), 0) / (bundle.stats.filter((stat) => stat.accuracy !== null && stat.total > 0).length || 1);
  const alphaLabel =
    bundle.alphaVsBenchmark !== null && bundle.alphaVsBenchmark !== undefined
      ? `Alpha vs ${benchmarkLabel || "SPY"} ${formatPercent(bundle.alphaVsBenchmark, 2)}`
      : `Benchmark ${benchmarkLabel || "SPY"} indisponible`;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <SectionHeading
        kicker="Signal directionnel"
        title={`Prédiction courte période — ${ticker}`}
        subtitle="Momentum + écart à la valeur intrinsèque, pénalisé par la volatilité"
        tone="dark"
        extra={
          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70">
            {globalAccuracy !== null ? `Précision globale ${formatPercent(globalAccuracy, 1)}` : "Précision indéfinie"}
            {Number.isFinite(tickerReliability) ? ` · Fiabilité ticker ${formatPercent(tickerReliability, 1)}` : ""}
          </span>
        }
      />
      <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/15 p-4 text-sm text-emerald-50/90">
        <p className="font-semibold text-emerald-50">Moteur léger</p>
        <p className="text-emerald-50/80">
          Combinaison d&apos;une pente de rendement hebdomadaire, d&apos;un filtre de volatilité et de l&apos;écart au prix
          intrinsèque {formatCurrency(intrinsicValue, "USD")}. Les périodes trop volatiles baissent la confiance.
        </p>
      </div>
      <div className="mt-2 rounded-2xl border border-amber-400/40 bg-amber-500/15 p-3 text-xs text-amber-50">
        Attention : ces signaux sont expérimentaux et ne garantissent pas les résultats futurs. Ne pas utiliser seuls pour
        investir.
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bundle.stats.map((stat) => (
          <div
            key={stat.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold text-white">
              {stat.accuracy !== null && stat.accuracy !== undefined
                ? formatPercent(stat.accuracy, 1)
                : "N/A"}
            </p>
            <p className="text-xs text-white/60">n = {stat.total}</p>
            <p className="text-[11px] text-white/60">
              TP {stat.confusion.tp} · TN {stat.confusion.tn} · FP {stat.confusion.fp} · FN {stat.confusion.fn}
            </p>
          </div>
        ))}
        <div className="rounded-2xl border border-sky-400/40 bg-sky-500/15 p-3 text-sm text-white/80">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">Benchmark</p>
          <p className="mt-1 text-xl font-semibold text-white">{alphaLabel}</p>
          <p className="text-xs text-white/60">Calculé sur la dernière année (si disponible)</p>
        </div>
        <div className="rounded-2xl border border-indigo-400/40 bg-indigo-500/15 p-3 text-sm text-white/80">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">Paper trading 1w</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {bundle.paperTrading !== null && bundle.paperTrading !== undefined
              ? formatPercent(bundle.paperTrading, 2)
              : "N/A"}
          </p>
          <p className="text-xs text-white/60">Signal long/short avec coût fixe 0.1%</p>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {rows.map((row) => {
          const returnValue =
            row.status === "PENDING" ? row.expectedReturn : row.realizedReturn ?? row.expectedReturn;
          const hasReturn = returnValue !== null && returnValue !== undefined;
          const isPositive = hasReturn ? returnValue >= 0 : null;
          const topDriver = row.topDriver || row.factors[0]?.label;
          return (
            <div
              key={`${row.targetDate}-${row.predicted}-${row.status}`}
              className="grid items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-[1.2fr,auto,auto,auto,auto,auto]"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                  {row.status === "PENDING" ? "À venir" : "Backtest"}
                </p>
                <p className="text-sm font-semibold text-white">{formatPredictionDate(row.targetDate)}</p>
                <p className="text-xs text-white/60">
                  {row.label} · {row.horizonLabel}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  row.predicted === "UP"
                    ? "border border-emerald-400/50 bg-emerald-500/20 text-emerald-50"
                    : "border border-amber-400/50 bg-amber-500/20 text-amber-50"
                }`}
              >
                {row.predicted === "UP" ? "Hausse anticipée" : "Baisse anticipée"}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                  row.actual === null
                    ? "border border-white/15 bg-white/5 text-white/70"
                    : row.actual === "UP"
                      ? "border border-emerald-400/50 bg-emerald-500/20 text-emerald-50"
                      : "border border-rose-400/50 bg-rose-500/20 text-rose-50"
                }`}
              >
                {row.actual === null ? "En attente" : row.actual === "UP" ? "Hausse réelle" : "Baisse réelle"}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
                  row.status === "RIGHT"
                    ? "border border-emerald-400/60 bg-emerald-500/25 text-emerald-50"
                    : row.status === "WRONG"
                      ? "border border-rose-400/60 bg-rose-500/20 text-rose-50"
                      : "border border-slate-300/30 bg-white/5 text-white/70"
                }`}
              >
                {row.status === "RIGHT" ? "Correct" : row.status === "WRONG" ? "Incorrect" : "En attente"}
              </span>
              <div className="text-center">
                <p className="text-lg font-semibold text-white">{row.confidence.toFixed(1)}%</p>
                <p className="text-xs text-white/60">Confiance</p>
              </div>
              <div className="text-right sm:text-center">
                <p
                  className={`text-lg font-semibold ${
                    isPositive === null ? "text-white" : isPositive ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {hasReturn ? formatPercent(returnValue, 2) : "N/A"}
                </p>
                <p className="text-xs text-white/60">
                  {row.status === "PENDING" ? "Mouvement anticipé" : "Mouvement constaté"}
                </p>
                <p className="text-[11px] text-white/50">
                  Intervalle : {formatPercent(row.expectedRange.low, 2)} → {formatPercent(row.expectedRange.high, 2)}
                </p>
              </div>
              <div className="sm:col-span-6">
                <div className="flex flex-wrap gap-2 text-[11px] text-white/75">
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-wide text-white/70">
                    Mode {row.regime === "trend" ? "Trend-following" : "Mean-revert"} • Driver principal : {topDriver}
                  </span>
                  {row.factors.map((factor) => {
                    const tone = factor.contribution >= 0 ? "text-emerald-200 bg-emerald-500/15 border-emerald-400/40" : "text-rose-200 bg-rose-500/15 border-rose-400/40";
                    return (
                      <span
                        key={`${row.targetDate}-${factor.label}-${factor.weight}`}
                        className={`rounded-full border px-3 py-1 ${tone}`}
                        title={factor.hint}
                      >
                        {factor.label}: {(factor.contribution * 100).toFixed(1)} pts · pondération {(factor.weight * 100).toFixed(0)}%
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function buildPredictions(
  history: PricePoint[],
  benchmarkHistory: PricePoint[],
  intrinsicValue: NullableNumber,
  benchmarkLabel?: string | null,
  macroVix?: NullableNumber,
): PredictionBundle {
  if (!history || history.length < 6) {
    return {
      rows: [],
      stats: [],
      alphaVsBenchmark: null,
      benchmarkLabel: benchmarkLabel || "SPY",
      paperTrading: null,
    };
  }

  const horizons = [
    { id: "1w", label: "Horizon 1 semaine", lookback: 6, forward: 1 },
    { id: "4w", label: "Horizon 1 mois", lookback: 10, forward: 4 },
  ] as const;

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const rows: DirectionPrediction[] = [];

  horizons.forEach((config) => {
    for (let cursor = config.lookback; cursor < sorted.length; cursor++) {
      const baseIndex = cursor;
      const window = sorted.slice(baseIndex - config.lookback, baseIndex + 1);
      const signal = computeDirectionalSignal(window, intrinsicValue, macroVix);
      const basePoint = sorted[baseIndex];
      const targetIndex = baseIndex + config.forward;
      const nextPoint = sorted[targetIndex];
      const realized =
        nextPoint && basePoint && basePoint.close
          ? (nextPoint.close - basePoint.close) / basePoint.close
          : null;
      const actualDirection = realized !== null ? (realized >= 0 ? "UP" : "DOWN") : null;
      const status: DirectionPrediction["status"] =
        actualDirection === null
          ? "PENDING"
          : actualDirection === signal.direction
            ? "RIGHT"
            : "WRONG";
      rows.push({
        targetDate: nextPoint?.date ?? addDaysSafe(basePoint.date, config.forward * 7),
        label: nextPoint ? "Backtest" : "Prévision prochaine séance",
        predicted: signal.direction,
        actual: actualDirection,
        status,
        confidence: signal.confidence,
        expectedReturn: signal.expectedReturn,
        realizedReturn: realized,
        horizonLabel: config.label,
        horizonId: config.id,
        factors: signal.factors,
        expectedRange: signal.expectedRange,
        regime: signal.regime,
        topDriver: signal.topDriver,
      });
    }
  });

  const latestRows = rows.slice(-12).reverse();
  const stats = horizons.map((config) => {
    const subset = rows.filter((row) => row.horizonId === config.id && row.status !== "PENDING");
    const confusion: ConfusionCounts = { tp: 0, tn: 0, fp: 0, fn: 0 };
    subset.forEach((row) => {
      if (row.predicted === "UP" && row.actual === "UP") confusion.tp += 1;
      if (row.predicted === "DOWN" && row.actual === "DOWN") confusion.tn += 1;
      if (row.predicted === "UP" && row.actual === "DOWN") confusion.fp += 1;
      if (row.predicted === "DOWN" && row.actual === "UP") confusion.fn += 1;
    });
    const accuracy = subset.length ? subset.filter((row) => row.status === "RIGHT").length / subset.length : null;
    return { id: config.id, label: config.label, accuracy, total: subset.length, confusion };
  });

  const alphaVsBenchmark = computeAlpha(history, benchmarkHistory);
  const paperTrading = simulatePaperTrading(rows.filter((row) => row.horizonId === "1w"));

  return {
    rows: latestRows,
    stats,
    alphaVsBenchmark,
    benchmarkLabel: benchmarkLabel || "SPY",
    paperTrading,
  };
}

function computeDirectionalSignal(
  window: PricePoint[],
  intrinsicValue: NullableNumber,
  macroVix?: NullableNumber,
): DirectionalSignal {
  const closes = window
    .map((point) => point.close)
    .filter((value) => Number.isFinite(value)) as number[];
  if (closes.length < 3) {
    return {
      direction: "UP" as const,
      confidence: 55,
      expectedReturn: null,
      factors: [],
      expectedRange: { low: null, high: null },
      regime: "trend",
      topDriver: undefined,
    };
  }
  const lastClose = closes[closes.length - 1];
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (!prev) continue;
    const change = (closes[i] - prev) / prev;
    if (Number.isFinite(change)) {
      returns.push(change);
    }
  }
  const momentum = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const volatility =
    returns.length > 1
      ? Math.sqrt(returns.reduce((sum, value) => sum + Math.pow(value - momentum, 2), 0) / returns.length)
      : 0;
  const useGap = intrinsicValue !== null && intrinsicValue !== undefined && Math.abs(lastClose) > 1e-6;
  const valuationGap = useGap ? (intrinsicValue - lastClose) / lastClose : 0;
  const longTrend = closes.length >= 5 ? (lastClose - average(closes.slice(-5))) / average(closes.slice(-5)) : 0;
  const blended = 0.5 * momentum + 0.3 * valuationGap + 0.2 * longTrend;
  const direction: "UP" | "DOWN" = blended >= 0 ? "UP" : "DOWN";

  const magnitude = Math.min(0.15, Math.abs(blended));
  const baseConfidence = 0.55 + magnitude * 1.6;
  const volPenalty = Math.min(0.18, volatility * 2.2);
  const vixPenalty = macroVix && macroVix > 20 ? Math.min(0.12, (macroVix - 20) / 100) : 0;
  const confidencePercent = Math.max(0.35, Math.min(0.92, baseConfidence - volPenalty - vixPenalty)) * 100;
  const expectedReturn = Math.max(-0.25, Math.min(0.25, blended * 1.1));
  const band = Math.min(0.35, volatility * 1.5 + 0.02);
  const expectedRange = {
    low: Math.max(-0.4, (expectedReturn ?? 0) - band),
    high: Math.min(0.4, (expectedReturn ?? 0) + band),
  };

  const regime: "trend" | "mean_revert" = Math.abs(longTrend) > Math.abs(momentum) ? "trend" : "mean_revert";

  const factors: FactorBreakdown[] = [
    {
      label: "Momentum 6w",
      weight: 0.5,
      value: momentum,
      contribution: 0.5 * momentum,
      hint: "Rendement moyen des 6 dernières observations.",
    },
    {
      label: "Écart DCF",
      weight: 0.3,
      value: valuationGap,
      contribution: 0.3 * valuationGap,
      hint: "Ecart entre cours et valeur intrinsèque estimée.",
    },
    {
      label: "Tendance longue",
      weight: 0.2,
      value: longTrend,
      contribution: 0.2 * longTrend,
      hint: "Delta entre le dernier prix et la moyenne des 5 derniers points.",
    },
    {
      label: "Volatilité",
      weight: -0.2,
      value: volatility,
      contribution: -Math.min(0.1, volatility * 0.5),
      hint: "Plus la volatilité est forte, plus la confiance est réduite.",
    },
  ];
  const topDriver =
    factors.length > 0
      ? factors.reduce((best, current) => (Math.abs(current.contribution) > Math.abs(best.contribution) ? current : best)).label
      : undefined;

  return {
    direction,
    confidence: Math.round(confidencePercent * 10) / 10,
    expectedReturn,
    expectedRange,
    regime,
    topDriver,
    factors,
  };
}

function addDaysSafe(dateInput: string, days: number) {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return dateInput || "Date inconnue";
  }
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatPredictionDate(dateInput: string) {
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return dateInput || "Date inconnue";
  }
  return parsed.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function computeAlpha(history: PricePoint[], benchmarkHistory: PricePoint[]): NullableNumber {
  if (!history?.length || !benchmarkHistory?.length) return null;
  const own = computeSimpleReturn(history);
  const bench = computeSimpleReturn(benchmarkHistory);
  if (own == null || bench == null) return null;
  return own - bench;
}

function computeSimpleReturn(series: PricePoint[]): NullableNumber {
  if (!series.length) return null;
  const sorted = [...series].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0]?.close;
  const last = sorted[sorted.length - 1]?.close;
  if (!first || !last) return null;
  return (last - first) / first;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function simulatePaperTrading(predictions: DirectionPrediction[]): NullableNumber {
  const filled = predictions.filter(
    (prediction) => prediction.realizedReturn !== null && prediction.realizedReturn !== undefined,
  );
  if (!filled.length) return null;
  let equity = 1;
  const cost = 0.001; // slippage simple
  filled.forEach((prediction) => {
    const move = prediction.realizedReturn ?? 0;
    const applied = prediction.predicted === "UP" ? move : -move;
    equity *= 1 + applied - cost;
  });
  return equity - 1;
}

function AlertsCard({
  alerts,
  loading,
  error,
  form,
  setForm,
  onSubmit,
  onDelete,
}: {
  alerts: AlertItem[];
  loading: boolean;
  error: string | null;
  form: AlertFormState;
  setForm: Dispatch<SetStateAction<AlertFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <SectionHeading
        kicker="Alertes"
        title="Déclencheurs & notifications"
        subtitle="Stockage via l'API backend /alerts"
        tone="dark"
      />
      {error && (
        <div className="mt-3 rounded-2xl border border-rose-400/40 bg-rose-500/15 p-3 text-sm text-rose-50">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 lg:grid-cols-[2fr,2fr,1fr,auto]">
        <input
          type="text"
          value={form.ticker}
          onChange={(event) => setForm((prev) => ({ ...prev, ticker: event.target.value.toUpperCase() }))}
          placeholder="Ticker"
          className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-300 focus:outline-none"
        />
        <div className="grid grid-cols-3 gap-2">
          <select
            value={form.metric}
            onChange={(event) => setForm((prev) => ({ ...prev, metric: event.target.value }))}
            className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 focus:border-emerald-300 focus:outline-none"
          >
            <option value="prix">Prix spot</option>
            <option value="ecart_dcf">Ecart DCF (%)</option>
            <option value="confiance_pred">Confiance prédiction (%)</option>
          </select>
          <select
            value={form.operator}
            onChange={(event) => setForm((prev) => ({ ...prev, operator: event.target.value }))}
            className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 focus:border-emerald-300 focus:outline-none"
          >
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
          </select>
          <input
            type="number"
            value={form.threshold}
            onChange={(event) => setForm((prev) => ({ ...prev, threshold: event.target.value }))}
            placeholder="Seuil"
            className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-300 focus:outline-none"
          />
        </div>
        <input
          type="text"
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          placeholder="Note optionnelle"
          className="rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-300 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:opacity-60"
        >
          {loading ? "…" : "Ajouter"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, metric: "confiance_pred", operator: ">=", threshold: "70" }))}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 hover:border-emerald-300 hover:text-emerald-100"
          disabled={loading}
        >
          Preset : Confiance ≥ 70%
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, metric: "ecart_dcf", operator: "<=", threshold: "-0.15" }))}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 hover:border-emerald-300 hover:text-emerald-100"
          disabled={loading}
        >
          Preset : Écart DCF ≤ -15%
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, metric: "prix", operator: "<=", threshold: form.threshold || "" }))}
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 hover:border-emerald-300 hover:text-emerald-100"
          disabled={loading}
        >
          Preset : Prix en dessous du seuil
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {alerts.length === 0 && (
          <p className="text-sm text-white/70">Aucune alerte stockée pour le moment.</p>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80"
          >
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase">
              {alert.ticker}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold">
              {alert.metric} {alert.operator} {alert.threshold}
            </span>
            {alert.note && <span className="rounded-2xl bg-white/5 px-3 py-1 text-xs">{alert.note}</span>}
            <button
              type="button"
              onClick={() => onDelete(alert.id)}
              className="ml-auto rounded-full border border-rose-400/50 px-3 py-1 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
              disabled={loading}
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceHistorySection({
  priceHistory,
  ticker,
  currentPrice,
}: {
  priceHistory: PricePoint[];
  ticker: string;
  currentPrice: NullableNumber;
}) {
  const hasHistory = priceHistory.length > 0;
  const lastPoint = hasHistory ? priceHistory[priceHistory.length - 1] : null;
  const firstPoint = hasHistory ? priceHistory[0] : null;
  const monthAnchor = hasHistory ? priceHistory[Math.max(0, priceHistory.length - 5)] : null;
  const quarterAnchor = hasHistory ? priceHistory[Math.max(0, priceHistory.length - 13)] : null;
  const minCloseRaw = hasHistory ? Math.min(...priceHistory.map((point) => point.close)) : null;
  const maxCloseRaw = hasHistory ? Math.max(...priceHistory.map((point) => point.close)) : null;
  const minClose = minCloseRaw !== null && Number.isFinite(minCloseRaw) ? minCloseRaw : null;
  const maxClose = maxCloseRaw !== null && Number.isFinite(maxCloseRaw) ? maxCloseRaw : null;

  const perf = (start?: PricePoint | null) => {
    if (!start || !lastPoint || start.close === 0) return null;
    return (lastPoint.close - start.close) / start.close;
  };

  const perfYear = perf(firstPoint);
  const perfQuarter = perf(quarterAnchor);
  const perfMonth = perf(monthAnchor);

  const formatDate = (value?: string) => {
    if (!value) return "N/A";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("fr-FR");
  };

  if (!hasHistory) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Cours</p>
        <h2 className="text-xl font-semibold">Historique indisponible</h2>
        <p className="text-sm text-white/70">Aucune série de prix n&apos;a été remontée pour {ticker}. Relancez l&apos;analyse ou fournissez un ticker différent.</p>
      </section>
    );
  }

  const range = maxClose !== null && minClose !== null ? Math.max(maxClose - minClose, 1e-9) : 1;
  const coords = priceHistory.map((point, index) => {
    const x = (index / Math.max(priceHistory.length - 1, 1)) * 100;
    const y = 100 - ((point.close - (minClose ?? 0)) / range) * 100;
    return { x, y };
  });
  const linePath = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;
  const lastCoord = coords[coords.length - 1];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Cours</p>
          <h2 className="text-xl font-semibold">Historique {ticker}</h2>
          <p className="text-sm text-white/70">Clôtures hebdomadaires (1 an) – aperçu rapide de la tendance.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Spot</p>
          <p className="text-2xl font-semibold text-white">{formatCurrency(currentPrice ?? lastPoint?.close, "USD")}</p>
          <p className="text-xs text-white/60">Dernier point : {formatDate(lastPoint?.date)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <svg viewBox="0 0 100 100" className="h-64 w-full" preserveAspectRatio="none" role="img" aria-label={`Historique de cours ${ticker}`}>
            <defs>
              <linearGradient id="priceLine" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <linearGradient id="priceArea" x1="0%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(52, 211, 153, 0.35)" />
                <stop offset="100%" stopColor="rgba(52, 211, 153, 0.05)" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#priceArea)" stroke="none" />
            <path d={linePath} fill="none" stroke="url(#priceLine)" strokeWidth={1.8} strokeLinecap="round" />
            <circle cx={lastCoord?.x ?? 0} cy={lastCoord?.y ?? 0} r={1.5} fill="#34d399" />
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-white/60">
            <span>{formatDate(firstPoint?.date)}</span>
            <span>{formatDate(lastPoint?.date)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TrendPill label="Performance 1 an" value={perfYear} />
          <TrendPill label="Performance 3 mois" value={perfQuarter} />
          <TrendPill label="Performance 1 mois" value={perfMonth} />
          <RangeCard min={minClose} max={maxClose} />
        </div>
      </div>
    </section>
  );
}

function TrendPill({ label, value }: { label: string; value: NullableNumber }) {
  const isPositive = value !== null && value !== undefined && value >= 0;
  const tone =
    value === null || value === undefined
      ? "border-white/15 bg-white/5 text-white/80"
      : isPositive
        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-50"
        : "border-rose-400/40 bg-rose-500/15 text-rose-50";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value === null || value === undefined ? "N/A" : formatPercent(value, 1)}</p>
      {value !== null && value !== undefined && (
        <p className="text-xs opacity-80">{isPositive ? "Tendance haussière" : "Tendance baissière"}</p>
      )}
    </div>
  );
}

function RangeCard({ min, max }: { min: NullableNumber; max: NullableNumber }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
      <p className="text-xs uppercase tracking-wide text-white/60">Amplitude 1 an</p>
      <p className="mt-2 text-lg font-semibold">
        {formatCurrency(min, "USD")} → {formatCurrency(max, "USD")}
      </p>
      <p className="text-xs text-white/60">Clôtures hebdomadaires</p>
    </div>
  );
}

function NewsSection({ news, ticker }: { news: NewsItem[]; ticker: string }) {
  const formatDateTime = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  };

  if (!news.length) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">News</p>
        <h2 className="text-xl font-semibold">Aucune actualité récente</h2>
        <p className="text-sm text-white/70">
          Pas de flux disponible pour {ticker} pour le moment. Réessayez plus tard.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">News</p>
          <h2 className="text-xl font-semibold">Dernières actualités</h2>
          <p className="text-sm text-white/70">Sélection automatisée des titres pertinents remontés par Yahoo Finance.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/60">
          {news.length} articles
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {news.map((item) => (
          <a
            key={`${item.title}-${item.link}`}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-emerald-300 hover:-translate-y-1"
          >
            <p className="text-xs uppercase tracking-wide text-white/60">
              {item.publisher || "Source inconnue"} • {formatDateTime(item.published_at) || "Date inconnue"}
            </p>
            <p className="mt-2 text-lg font-semibold text-white line-clamp-3">{item.title}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function KeyMetrics({ keyData, ticker, variant = "dark" }: { keyData: KeyData; ticker: string; variant?: "light" | "dark" }) {
  const cards = [
    { label: "Prix actuel", value: keyData.prix_actuel, format: (v: number | null | undefined) => formatCurrency(v, "USD") },
    { label: "Earnings per Share (TTM)", value: keyData.EPS, format: (v: number | null | undefined) => formatCurrency(v, "USD") },
    { label: "Croissance attendue", value: keyData.croissance, format: (v: number | null | undefined) => formatPercent(v, 1) },
    { label: "Free Cash Flow", value: keyData.FCF, format: (v: number | null | undefined) => `${formatCompact(v)}$` },
    { label: "Dette nette", value: keyData.dette, format: (v: number | null | undefined) => `${formatCompact(v)}$` },
    { label: "Marge nette", value: keyData.marge, format: (v: number | null | undefined) => formatPercent(v, 1) },
    {
      label: "Return on Equity / Return on Assets",
      value: keyData.ROE,
      format: () => `${formatPercent(keyData.ROE, 1)} · ${formatPercent(keyData.ROA, 1)}`,
    },
    { label: "Payout ratio", value: keyData.payout_ratio, format: (v: number | null | undefined) => formatPercent(v, 1) },
  ];

  const isDark = variant === "dark";
  const wrapperClass = isDark
    ? "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl"
    : "rounded-3xl bg-white p-6 shadow-lg";
  const kickerClass = isDark ? "text-emerald-200/90" : "text-slate-400";
  const titleClass = isDark ? "text-white" : "text-slate-900";
  const chipClass = isDark ? "bg-white/10 text-white/80" : "bg-slate-100 text-slate-600";

  return (
    <section className={wrapperClass}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[0.3em] ${kickerClass}`}>Vue d&apos;ensemble</p>
          <h2 className={`text-2xl font-semibold ${titleClass}`}>{ticker} — données clés</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chipClass}`}>
          Multiples secteur PE {formatNumber(keyData.sector_multiples.PE)}
        </span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.format(card.value)} variant={variant} />
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, variant = "dark" }: { label: string; value: string; variant?: "light" | "dark" }) {
  const isDark = variant === "dark";
  const cardClass = isDark
    ? "rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-white/5"
    : "rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm";
  const labelClass = isDark ? "text-xs uppercase tracking-wide text-white/70" : "text-sm text-slate-500";
  const valueClass = isDark ? "mt-2 text-2xl font-semibold text-white" : "mt-2 text-2xl font-semibold text-slate-900";
  return (
    <div className={cardClass}>
      <p className={labelClass}>{label}</p>
      <p className={valueClass}>{value}</p>
    </div>
  );
}

function Ratios({ multiples }: { multiples: RatioRow[] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Comparaison</p>
          <h2 className="text-xl font-semibold">Multiples clés et formules</h2>
          <p className="text-sm text-white/70">
            Chaque ratio affiche la formule théorique et les données utilisées pour la calculer.
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {multiples.map((ratio) => (
          <div
            key={ratio.ratio}
            className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-[1.1fr,1fr,1fr,auto]"
          >
            <div>
              <p className="text-sm font-medium text-white/80">{ratio.ratio}</p>
              <p className="text-2xl font-semibold">{formatNumber(ratio.value)}</p>
              {ratio.formula && (
                <p className="mt-2 text-xs text-white/60">
                  Formule : <span className="font-mono text-white/80">{ratio.formula}</span>
                </p>
              )}
              {ratio.calculation && (
                <p className="text-xs text-white/60">
                  Calcul appliqué : <span className="font-mono text-white/80">{ratio.calculation}</span>
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Secteur</p>
              <p className="text-lg font-semibold text-white">{formatNumber(ratio.sector)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Historique 5 ans</p>
              <p className="text-lg font-semibold text-white">{formatNumber(ratio.historic_5y)}</p>
            </div>
            <span className={`self-start rounded-full px-3 py-1 text-sm font-semibold ${verdictColor(ratio.verdict)}`}>
              {ratio.verdict}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Scoring({ scoring }: { scoring: AnalyzerResponse["scoring"] }) {
  const items = [
    { label: "Santé financière", value: scoring.sante_financiere, colors: "from-emerald-400 to-emerald-600" },
    { label: "Croissance", value: scoring.croissance, colors: "from-sky-400 to-sky-600" },
    { label: "Valorisation", value: scoring.valorisation, colors: "from-amber-400 to-amber-600" },
    { label: "Risque", value: scoring.risque, colors: "from-rose-400 to-rose-600" },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Scoring</p>
      <h2 className="text-xl font-semibold">Score global {scoring.score_total.toFixed(1)}</h2>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <ScoreBar key={item.label} {...item} />
        ))}
      </div>
    </section>
  );
}

function ScoreBar({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>{label}</span>
        <span className="font-semibold text-white">{value.toFixed(1)} / 100</span>
      </div>
      <div className="mt-2 h-3 rounded-full bg-white/10">
        <div
          className={`h-3 rounded-full bg-gradient-to-r ${colors}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function DcfCard({ dcf }: { dcf: AnalyzerResponse["dcf"] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Discounted Cash Flow</p>
      <h2 className="text-xl font-semibold">Valorisation intrinsèque</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <InfoPill label="Coût moyen pondéré du capital" value={formatPercent(dcf.wacc, 2)} />
        <InfoPill label="Valeur terminale" value={formatCompact(dcf.valeur_terminale)} />
        <InfoPill label="Free Cash Flow actualisé (5 ans)" value={formatCompact(dcf.fcf_croissance_5y)} />
        <InfoPill label="Valeur intrinsèque" value={formatCurrency(dcf.valeur_intrinseque_action, "USD")} />
      </div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
        <p className="font-semibold text-white">Comparaison avec le prix du marché</p>
        <p>{dcf.comparaison}</p>
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-white/20 bg-transparent p-4 text-xs text-white/70">
        <p className="font-semibold text-white">Formule rappelée</p>
        <p>
          Valeur intrinsèque = Σ<sub>t=1..5</sub> (FCF<sub>t</sub> / (1 + WACC)<sup>t</sup>) + Valeur terminale / (1 + WACC)<sup>5</sup> −
          Dette nette, puis division par le nombre d&apos;actions.
        </p>
      </div>
    </div>
  );
}

function VerdictSection({
  analysis,
  resumeLines,
}: {
  analysis: AnalyzerResponse;
  resumeLines: string[];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-4xl">{analysis.verdict_final.etat.split(" ")[0]}</span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Verdict</p>
          <h2 className="text-xl font-semibold">{analysis.verdict_final.etat}</h2>
        </div>
      </div>
      <p className="mt-4 text-white/80">{analysis.verdict_final.explication}</p>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">Résumé investisseur</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/80">
          {resumeLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-100">Recommandation</p>
          <p className="text-2xl font-semibold text-white">{analysis.recommandation.signal}</p>
          <p className="text-sm text-emerald-100/80">{analysis.recommandation.horizon}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/15 p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-amber-100">Catalyseurs</p>
          <p className="text-xs text-amber-50">
            Facteurs susceptibles d’accélérer la réévaluation (basés sur croissance, valorisation et profil financier).
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-white">
            {analysis.recommandation.principaux_catalyseurs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/15 p-4 text-white">
        <p className="text-xs uppercase tracking-wide text-rose-100">Risques clés</p>
        <p className="text-xs text-rose-50">
          Principales menaces identifiées à partir des scores de risque, du levier et des flux de trésorerie.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
          {analysis.recommandation.principaux_risques.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function NotesCard({
  title,
  items,
  fallback,
}: {
  title: string;
  items: string[];
  fallback?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">{title}</p>
      {items.length ? (
        <ul className="mt-4 space-y-2 text-sm text-white/80">
          {items.map((item) => (
            <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-white/60">{fallback || "Aucune note pour cette section."}</p>
      )}
    </div>
  );
}

function ScenarioSection({
  scenarios,
  preset,
  setPreset,
  customValue,
  backendWeighted,
  monteCarlo,
}: {
  scenarios: DcfScenarioBlock;
  preset: ScenarioPreset;
  setPreset: (preset: ScenarioPreset) => void;
  customValue: NullableNumber;
  backendWeighted: NullableNumber;
  monteCarlo: MonteCarloSummary;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">
            Discounted Cash Flow multi-scénarios
          </p>
          <h2 className="text-xl font-semibold">Bear / Base / Bull</h2>
        </div>
        <select
          value={preset}
          onChange={(event) => setPreset(event.target.value as ScenarioPreset)}
          className="rounded-2xl border border-white/30 bg-white/5 px-3 py-2 text-sm text-white/80 focus:border-emerald-300 focus:outline-none"
        >
          {Object.entries(SCENARIO_PRESETS).map(([key, config]) => (
            <option key={key} value={key}>
              {config.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {scenarios.scenarios.map((scenario) => (
          <div
            key={scenario.name}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm"
          >
            <p className="text-xs uppercase tracking-wide text-white/60">{scenario.name}</p>
            <p className="mt-1 text-2xl font-semibold text-white">
              {formatCurrency(scenario.intrinsic_value, "USD")}
            </p>
            <p className="text-sm text-white/70">
              Coût moyen pondéré du capital {formatPercent(scenario.wacc, 2)} · Croissance {formatPercent(scenario.growth_rate, 2)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-100">Valeur pondérée (backend)</p>
          <p className="text-3xl font-semibold text-white">
            {formatCurrency(backendWeighted, "USD")}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/15 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-100">
            Pondération {SCENARIO_PRESETS[preset].label}
          </p>
          <p className="text-3xl font-semibold text-white">
            {formatCurrency(customValue, "USD")}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-wide text-white/60">Monte Carlo ({monteCarlo.iterations} tirages)</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/80">
          <span>Median : {formatCurrency(monteCarlo.median, "USD")}</span>
          <span>Min : {formatCurrency(monteCarlo.min, "USD")}</span>
          <span>Max : {formatCurrency(monteCarlo.max, "USD")}</span>
        </div>
      </div>
    </section>
  );
}

function AdvancedMetricsSection({ metrics }: { metrics: AdvancedMetrics }) {
  const cards = [
    {
      label: "Return on Invested Capital",
      value: formatPercent(metrics.roic, 2),
      formula: "ROIC = Résultat net / Capital investi",
    },
    {
      label: "Free Cash Flow Yield",
      value: formatPercent(metrics.fcf_yield, 2),
      formula: "Free Cash Flow Yield = Free Cash Flow / Capitalisation boursière",
    },
    {
      label: "Marge opérationnelle",
      value: formatPercent(metrics.operating_margin, 2),
      formula: "Marge = Résultat net / Revenu",
    },
    {
      label: "Piotroski",
      value: metrics.piotroski_score ?? "N/A",
      formula: "Score Piotroski = Somme des 9 indicateurs fondamentaux (profitabilité, levier, efficience)",
    },
    {
      label: "Altman Z-Score",
      value: metrics.z_score !== null && metrics.z_score !== undefined ? metrics.z_score.toFixed(2) : "N/A",
      formula: "Z-Score = 1.2×(Fonds de roulement/Actifs) + … + 1.0×(Revenu/Actifs)",
    },
  ];
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Ratios avancés</p>
      <h2 className="text-xl font-semibold">Qualité, valorisation et risque</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/60">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-xs text-white/60">{card.formula}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TimelineItem({
  title,
  status,
  description,
}: {
  title: string;
  status: string;
  description: string;
}) {
  const colors =
    status === "done"
      ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
      : status === "warning"
        ? "border border-amber-500/30 bg-amber-500/15 text-amber-100"
        : "border border-white/10 bg-white/5 text-white/80";
  return (
    <div className={`rounded-2xl p-4 text-sm ${colors}`}>
      <p className="text-xs uppercase tracking-wide">{title}</p>
      <p className="text-sm font-semibold text-white">{status === "done" ? "Validé" : status === "warning" ? "À confirmer" : "En attente"}</p>
      <p className="text-xs text-white/70">{description}</p>
    </div>
  );
}

function PlaceholderSection() {
  const sampleLines = [
    "Choisissez un ticker (AAPL, MSFT, TSLA…) pour générer un rapport.",
    "Ajustez le coût moyen pondéré du capital et la croissance terminale pour simuler différents scénarios.",
    "Utilisez les overrides pour injecter vos propres hypothèses (prix, Free Cash Flow, actions…).",
    "Téléchargez ensuite le JSON pour l'intégrer à vos outils internes.",
  ];
  return (
    <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white shadow-xl">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Prêt à démarrer</p>
      <h2 className="mt-2 text-2xl font-semibold">Votre premier rapport n&apos;attend plus que vous</h2>
      <p className="mt-2 text-white/70">
        Déclenchez l&apos;analyse pour transformer le JSON brut en un dossier investisseur complet.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sampleLines.map((line) => (
          <div key={line} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            {line}
          </div>
        ))}
      </div>
    </section>
  );
}

function generateChatbotResponse(question: string, analysis?: AnalyzerResponse | null): string {
  if (!analysis) {
    return "Lancez d'abord une analyse afin que je puisse répondre avec des données concrètes.";
  }
  const lower = question.toLowerCase();
  const verdict = analysis.verdict_final.etat;
  const intrinsic = formatCurrency(analysis.dcf.valeur_intrinseque_action, "USD");
  const price = formatCurrency(analysis.key_data.prix_actuel, "USD");
  const score = `${formatNumber(analysis.scoring.score_total)}/100`;
  const catalysts = analysis.recommandation.principaux_catalyseurs?.slice(0, 2).join("; ") || "aucun catalyseur renseigné";
  const risks = analysis.recommandation.principaux_risques?.slice(0, 2).join("; ") || "aucun risque majeur identifié";
  const advanced = analysis.advanced_metrics;

  if (lower.includes("piotroski")) {
    return advanced?.piotroski_score !== null && advanced?.piotroski_score !== undefined
      ? `Le score Piotroski de ${analysis.ticker} ressort à ${formatNumber(advanced.piotroski_score)} (sur 9). Plus il est élevé, plus la qualité fondamentale est jugée solide.`
      : "Le score Piotroski n'est pas disponible dans cette analyse.";
  }
  if (lower.includes("z-score") || lower.includes("altman")) {
    return advanced?.z_score !== null && advanced?.z_score !== undefined
      ? `L'Altman Z-Score de ${analysis.ticker} est ${formatNumber(advanced.z_score)}. Au-dessus de 3, le risque de faillite est jugé faible.`
      : "Le Z-Score n'est pas remonté pour cette société.";
  }
  if (lower.includes("monte Carlo".toLowerCase())) {
    const mc = analysis.monte_carlo;
    if (!mc || !mc.iterations) {
      return "Les simulations Monte Carlo ne sont pas disponibles pour ce rapport.";
    }
    return `La simulation Monte Carlo (${mc.iterations} tirages) donne une médiane de ${formatCurrency(mc.median, "USD")} avec un intervalle ${formatCurrency(mc.min, "USD")} - ${formatCurrency(mc.max, "USD")}.`;
  }
  if (lower.includes("wacc") || lower.includes("coût")) {
    return `Le WACC utilisé dans le scénario principal est ${formatPercent(analysis.dcf.wacc, 2)}. Il sert à actualiser le Free Cash Flow sur 5 ans et la valeur terminale.`;
  }
  if (lower.includes("terminal") || lower.includes("croissance")) {
    return `La croissance terminale retenue pour le Discounted Cash Flow est de ${formatPercent(analysis.dcf_scenarios?.scenarios?.[0]?.terminal_growth) || formatPercent(analysis.dcf.wacc / 3)}. Elle complète le scénario ${analysis.recommandation.signal}.`;
  }
  if (lower.includes("score") || lower.includes("scoring")) {
    const parts = analysis.scoring;
    return `Le score global est ${score}. Détail : Santé ${formatNumber(parts.sante_financiere)}/100, Croissance ${formatNumber(parts.croissance)}/100, Valorisation ${formatNumber(parts.valorisation)}/100, Risque ${formatNumber(parts.risque)}/100.`;
  }
  
  if (lower.includes("risque")) {
    return `Sur ${analysis.ticker}, les principaux risques mentionnés sont ${risks}. Ils sont issus de la section recommandation et complètent le verdict ${verdict}.`;
  }
  if (lower.includes("catalyseur")) {
    return `Les catalyseurs mis en avant pour ${analysis.ticker} sont ${catalysts}. Ils expliquent pourquoi la recommandation est ${analysis.recommandation.signal} sur un horizon ${analysis.recommandation.horizon}.`;
  }
  if (lower.includes("valuation") || lower.includes("valorisation") || lower.includes("prix")) {
    return `Le rapport estime une valeur intrinsèque de ${intrinsic} contre un prix spot de ${price}. Cela conduit au verdict "${verdict}" et au score global ${score}.`;
  }
  return `Pour ${analysis.ticker}, le verdict est "${verdict}" avec un score global de ${score}. La valeur intrinsèque ressort à ${intrinsic} versus ${price} sur le marché. Catalyseurs principaux : ${catalysts}. Risques clés : ${risks}.`;
}
