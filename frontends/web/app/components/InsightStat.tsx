import { ReactNode } from "react";

export type InsightStatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export function InsightStat({ label, value, hint }: InsightStatProps) {
  return (
    <div className="min-w-[140px] flex-1 rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.25em] opacity-70">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs opacity-70">{hint}</p>}
    </div>
  );
}
