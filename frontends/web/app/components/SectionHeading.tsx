import { ReactNode } from "react";

export type SectionHeadingProps = {
  kicker: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  tone?: "light" | "dark";
};

export function SectionHeading({ kicker, title, subtitle, extra, tone = "light" }: SectionHeadingProps) {
  const isDark = tone === "dark";
  const kickerClass = isDark ? "text-emerald-200/80" : "text-emerald-500";
  const titleClass = isDark ? "text-white" : "text-slate-900";
  const subtitleClass = isDark ? "text-white/70" : "text-slate-600";
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={`text-xs font-semibold uppercase tracking-[0.4em] ${kickerClass}`}>{kicker}</p>
        <h2 className={`mt-1 text-2xl font-semibold ${titleClass}`}>{title}</h2>
        {subtitle && <p className={`text-sm ${subtitleClass}`}>{subtitle}</p>}
      </div>
      {extra}
    </div>
  );
}
