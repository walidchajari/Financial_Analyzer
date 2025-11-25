import { PropsWithChildren, ReactNode } from "react";

export type GlassCardProps = PropsWithChildren<{
  title?: string;
  description?: string;
  actions?: ReactNode;
  headerRight?: ReactNode;
  padding?: string;
  className?: string;
}>;

export function GlassCard({
  title,
  description,
  actions,
  headerRight,
  padding = "p-6",
  className = "",
  children,
}: GlassCardProps) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-white/5 shadow-[0_10px_60px_-30px_rgba(15,23,42,0.5)] backdrop-blur-xl ${className}`}
    >
      <div className={`${padding} space-y-4`}>
        {(title || description || actions || headerRight) && (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              {description && <p className="text-sm opacity-80">{description}</p>}
            </div>
            <div className="flex items-center gap-3 text-sm opacity-80">
              {headerRight}
              {actions}
            </div>
          </div>
        )}
        <div className="space-y-4">{children}</div>
      </div>
    </section>
  );
}
