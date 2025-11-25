export type NullableNumber = number | null | undefined;

export type KeyData = {
  prix_actuel: NullableNumber;
  EPS: NullableNumber;
  revenu: NullableNumber;
  benefice_net: NullableNumber;
  FCF: NullableNumber;
  dette: NullableNumber;
  croissance: NullableNumber;
  marge: NullableNumber;
  ROE: NullableNumber;
  ROA: NullableNumber;
  payout_ratio: NullableNumber;
  sector_multiples: {
    PE: NullableNumber;
    PB: NullableNumber;
    EV_EBITDA: NullableNumber;
    PS: NullableNumber;
  };
  notes: string[];
};

export type RatioRow = {
  ratio: string;
  formula?: string | null;
  calculation?: string | null;
  value: NullableNumber;
  sector: NullableNumber;
  historic_5y: NullableNumber;
  verdict: string;
};

export type DcfSection = {
  fcf_croissance_5y: NullableNumber;
  valeur_terminale: NullableNumber;
  wacc: number;
  valeur_intrinseque_action: NullableNumber;
  prix_actuel: NullableNumber;
  comparaison: string;
  notes: string[];
};

export type DcfScenario = {
  name: string;
  wacc: number | null;
  growth_rate: NullableNumber;
  terminal_growth: NullableNumber;
  intrinsic_value: NullableNumber;
  weight: NullableNumber;
};

export type DcfScenarioBlock = {
  scenarios: DcfScenario[];
  weighted_intrinsic_value: NullableNumber;
};

export type AdvancedMetrics = {
  roic: NullableNumber;
  fcf_yield: NullableNumber;
  operating_margin: NullableNumber;
  piotroski_score: NullableNumber;
  z_score: NullableNumber;
};

export type MonteCarloSummary = {
  iterations: number;
  median: NullableNumber;
  min: NullableNumber;
  max: NullableNumber;
};

export type PricePoint = {
  date: string;
  close: number;
};

export type NewsItem = {
  title: string;
  link: string;
  publisher?: string | null;
  published_at?: string | null;
};

export type ScoringSection = {
  sante_financiere: number;
  croissance: number;
  valorisation: number;
  risque: number;
  score_total: number;
};

export type VerdictSection = {
  etat: string;
  explication: string;
};

export type RecommendationSection = {
  signal: string;
  horizon: string;
  principaux_risques: string[];
  principaux_catalyseurs: string[];
};

export type AnalyzerResponse = {
  ticker: string;
  key_data: KeyData;
  multiples_analysis: RatioRow[];
  dcf: DcfSection;
  dcf_scenarios: DcfScenarioBlock;
  monte_carlo: MonteCarloSummary;
  advanced_metrics: AdvancedMetrics;
  scoring: ScoringSection;
  verdict_final: VerdictSection;
  resume_investisseur: string;
  recommandation: RecommendationSection;
  price_history?: PricePoint[];
  benchmark_history?: PricePoint[];
  benchmark_ticker?: string | null;
  macro_risk?: {
    vix: NullableNumber;
    level: string | null;
  };
  news?: NewsItem[];
  erreur: string | null;
};

export type AnalysisRequest = {
  ticker: string;
  wacc: number;
  terminalGrowth: number;
  sector?: string;
  overrides?: Record<string, number>;
};
