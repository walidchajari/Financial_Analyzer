import type { NullableNumber } from "@/types/analyzer";

export function formatNumber(
  value: NullableNumber,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  const formatter = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    ...options,
  });
  return formatter.format(value);
}

export function formatCurrency(
  value: NullableNumber,
  currency = "USD",
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    ...options,
  });
}

export function formatPercent(
  value: NullableNumber,
  decimals = 1,
  fallback = "N/A",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return `${(value * 100).toFixed(decimals)} %`;
}

export function formatSignedPercent(value: NullableNumber): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  const pct = (value * 100).toFixed(1);
  return `${Number(pct) > 0 ? "+" : ""}${pct} %`;
}

export function formatCompact(
  value: NullableNumber,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, {
    notation: "compact",
    maximumFractionDigits: 1,
    ...options,
  });
}
