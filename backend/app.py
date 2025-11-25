#!/usr/bin/env python3
"""
Assistant d'évaluation fondamentale pour actions cotées.
Récupère les données Yahoo Finance, calcule les multiples, un DCF simplifié,
un score de qualité et fournit une recommandation structurée.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf
from yfinance.search import Search

DEFAULT_WACC = 0.08
DEFAULT_TERMINAL_GROWTH = 0.025

SECTOR_MULTIPLES = {
    "Technology": {"pe": 27.0, "pb": 8.0, "ps": 6.0, "ev_ebitda": 20.0},
    "Communication Services": {"pe": 18.0, "pb": 4.0, "ps": 4.0, "ev_ebitda": 12.0},
    "Consumer Cyclical": {"pe": 22.0, "pb": 5.0, "ps": 2.0, "ev_ebitda": 13.0},
    "Consumer Defensive": {"pe": 21.0, "pb": 4.0, "ps": 2.5, "ev_ebitda": 14.0},
    "Financial Services": {"pe": 12.0, "pb": 1.5, "ps": 2.0, "ev_ebitda": 10.0},
    "Healthcare": {"pe": 20.0, "pb": 4.0, "ps": 5.0, "ev_ebitda": 13.0},
    "Industrials": {"pe": 18.0, "pb": 3.0, "ps": 1.5, "ev_ebitda": 11.0},
    "Energy": {"pe": 9.0, "pb": 1.5, "ps": 1.0, "ev_ebitda": 5.0},
    "Basic Materials": {"pe": 17.0, "pb": 2.0, "ps": 1.5, "ev_ebitda": 8.0},
    "Utilities": {"pe": 16.0, "pb": 1.7, "ps": 2.0, "ev_ebitda": 9.0},
    "Real Estate": {"pe": 25.0, "pb": 2.2, "ps": 6.0, "ev_ebitda": 18.0},
    "Default": {"pe": 18.0, "pb": 2.5, "ps": 2.0, "ev_ebitda": 10.0},
}

SCENARIO_CONFIG = [
    {"name": "Bear", "weight": 0.25, "growth_mult": 0.5, "wacc_delta": 0.02, "terminal_delta": -0.01},
    {"name": "Base", "weight": 0.5, "growth_mult": 1.0, "wacc_delta": 0.0, "terminal_delta": 0.0},
    {"name": "Bull", "weight": 0.25, "growth_mult": 1.2, "wacc_delta": -0.02, "terminal_delta": 0.005},
]


@dataclass
class FinancialData:
    """Structure centrale pour stocker les données récupérées et calculées."""

    ticker: str
    name: str
    sector: Optional[str]
    industry: Optional[str]
    currency: Optional[str]
    price: Optional[float]
    eps: Optional[float]
    growth_rate: Optional[float]  # en décimal (0.10 = 10 %)
    book_value_per_share: Optional[float]
    shares_outstanding: Optional[float]
    equity: Optional[float]
    total_debt: Optional[float]
    total_cash: Optional[float]
    net_debt: Optional[float]
    free_cash_flow: Optional[float]
    market_cap: Optional[float]
    dividend: Optional[float]
    revenue: Optional[float]
    net_income: Optional[float]
    ebitda: Optional[float]
    roe: Optional[float]
    roa: Optional[float]
    payout_ratio: Optional[float]
    beta: Optional[float]
    sector_multiples: Dict[str, float]
    historical_multiples: Dict[str, Optional[float]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyse fondamentale et valorisation simplifiée à partir de Yahoo Finance."
    )
    parser.add_argument("ticker", type=str, help="Ticker Yahoo Finance (ex: AAPL, MSFT)")
    parser.add_argument(
        "--wacc",
        type=float,
        default=DEFAULT_WACC,
        help=f"WACC à utiliser pour le DCF (défaut {DEFAULT_WACC*100:.1f} %)",
    )
    parser.add_argument(
        "--terminal-growth",
        type=float,
        default=DEFAULT_TERMINAL_GROWTH,
        help=f"Taux de croissance perpétuel pour le DCF (défaut {DEFAULT_TERMINAL_GROWTH*100:.1f} %)",
    )
    parser.add_argument("--sector", type=str, default=None, help="Secteur à utiliser si le ticker ne le fournit pas.")
    parser.add_argument(
        "--no-prompt",
        action="store_true",
        help="Ne pas demander à l'utilisateur de compléter les données manquantes.",
    )
    return parser.parse_args()


def search_symbol(query: str) -> Tuple[Optional[str], Optional[str]]:
    """Utilise l'API de recherche Yahoo Finance pour trouver le ticker associé à un nom."""
    query = query.strip()
    if not query:
        return None, None
    try:
        results = Search(query, max_results=8, enable_fuzzy_query=True)
        quotes = results.quotes or []
    except Exception:
        return None, None
    if not quotes:
        return None, None
    preferred = None
    for quote in quotes:
        if quote.get("quoteType") == "EQUITY":
            preferred = quote
            break
    match = preferred or quotes[0]
    symbol = match.get("symbol")
    if not symbol:
        return None, None
    company_name = match.get("shortname") or match.get("longname") or match.get("name")
    return symbol.upper(), company_name


def has_core_data(data: FinancialData) -> bool:
    """Vérifie si au moins une donnée fondamentale critique est disponible."""
    core_fields = [data.price, data.market_cap, data.revenue, data.eps, data.free_cash_flow]
    for value in core_fields:
        if value is None:
            continue
        if isinstance(value, (int, float)) and value == 0:
            continue
        return True
    return False


def safe_first(*values: Any) -> Optional[Any]:
    for value in values:
        if value is None:
            continue
        if isinstance(value, (float, int)) and (math.isnan(value) or math.isinf(value)):
            continue
        return value
    return None


def normalize_growth(raw: Optional[float]) -> Optional[float]:
    if raw is None:
        return None
    if raw > 5:  # suppose que la donnée est en pourcentage
        return raw / 100.0
    return raw


def fetch_free_cash_flow(ticker_obj: yf.Ticker) -> Optional[float]:
    try:
        cashflow = ticker_obj.cashflow
    except Exception:
        cashflow = None
    if cashflow is None or cashflow.empty:
        return None

    def first_valid_row(*row_names: str) -> Optional[float]:
        for row_name in row_names:
            if row_name not in cashflow.index:
                continue
            series = cashflow.loc[row_name]
            for value in series:
                if not pd.isna(value):
                    return float(value)
        return None

    direct_fcf = first_valid_row("FreeCashFlow", "Free Cash Flow")
    if direct_fcf is not None:
        return direct_fcf

    operating_cf = first_valid_row(
        "Total Cash From Operating Activities", "Operating Cash Flow", "Cash Flow From Continuing Operating Activities"
    )
    if operating_cf is None:
        operating_cf = first_valid_row("Operating Cash Flow")
    capex = first_valid_row("Capital Expenditures", "Capital Expenditure")
    if operating_cf is not None and capex is not None:
        return float(operating_cf + capex)
    return None


def compute_equity(book_value: Optional[float], shares: Optional[float], info_equity: Optional[float]) -> Optional[float]:
    if info_equity is not None and not math.isnan(info_equity):
        return info_equity
    if book_value is not None and shares is not None:
        return book_value * shares
    return None


def fetch_historical_multiples(
    ticker_obj: yf.Ticker, shares: Optional[float], net_debt: Optional[float]
) -> Dict[str, Optional[float]]:
    result = {"pe": None, "pb": None, "ps": None, "ev_ebitda": None}
    if shares is None or shares <= 0:
        return result

    try:
        price_history = ticker_obj.history(period="5y")
    except Exception:
        price_history = pd.DataFrame()

    if price_history.empty:
        return result

    price_yearly = price_history["Close"].resample("Y").mean()
    price_map = {ts.year: price for ts, price in price_yearly.items() if price and not math.isnan(price)}

    earnings = ticker_obj.earnings
    if earnings is not None and not earnings.empty:
        pe_values: List[float] = []
        ps_values: List[float] = []
        for year, row in earnings.iterrows():
            price = price_map.get(year)
            earnings_value = row.get("Earnings")
            revenue_value = row.get("Revenue")
            if price and earnings_value and earnings_value != 0:
                eps_year = earnings_value / shares
                if eps_year:
                    pe_values.append(price / eps_year)
            if price and revenue_value and revenue_value > 0:
                revenue_per_share = revenue_value / shares
                if revenue_per_share:
                    ps_values.append(price / revenue_per_share)
        result["pe"] = float(np.nanmean(pe_values)) if pe_values else None
        result["ps"] = float(np.nanmean(ps_values)) if ps_values else None

    try:
        balance_sheet = ticker_obj.balance_sheet
    except Exception:
        balance_sheet = pd.DataFrame()

    if balance_sheet is not None and not balance_sheet.empty and "Total Stockholder Equity" in balance_sheet.index:
        equities = balance_sheet.loc["Total Stockholder Equity"]
        pb_values: List[float] = []
        for column_date, equity_value in equities.items():
            if pd.isna(equity_value):
                continue
            price = price_map.get(getattr(column_date, "year", None))
            if price and shares:
                bvps = equity_value / shares
                if bvps:
                    pb_values.append(price / bvps)
        result["pb"] = float(np.nanmean(pb_values)) if pb_values else None

    try:
        financials = ticker_obj.financials
    except Exception:
        financials = pd.DataFrame()

    if (
        financials is not None
        and not financials.empty
        and "Ebitda" in financials.index
        and net_debt is not None
    ):
        ebitda_series = financials.loc["Ebitda"]
        ev_ebitda_values: List[float] = []
        for column_date, ebitda_value in ebitda_series.items():
            if pd.isna(ebitda_value) or ebitda_value == 0:
                continue
            price = price_map.get(getattr(column_date, "year", None))
            if price:
                market_cap_year = price * shares
                ev = market_cap_year + net_debt
                ev_ebitda_values.append(ev / ebitda_value)
        result["ev_ebitda"] = float(np.nanmean(ev_ebitda_values)) if ev_ebitda_values else None

    return result


def fetch_price_history(
    ticker_symbol: str,
    period: str = "1y",
    interval: str = "1wk",
) -> List[Dict[str, Any]]:
    """
    Récupère une série de prix sur une période donnée (par défaut 1 an en hebdomadaire).
    Retourne une liste prête à être sérialisée pour le frontend.
    """
    try:
        history = yf.Ticker(ticker_symbol).history(period=period, interval=interval)
    except Exception:
        history = pd.DataFrame()

    if history is None or history.empty or "Close" not in history:
        return []

    series: List[Dict[str, Any]] = []
    closes = history["Close"]
    for ts, close in closes.items():
        if pd.isna(close):
            continue
        try:
            date_value = ts.date().isoformat()
        except Exception:
            date_value = str(ts)
        series.append({"date": date_value, "close": float(close)})
    return series


def fetch_company_news(ticker_symbol: str, limit: int = 8) -> List[Dict[str, Any]]:
    """Récupère les news récentes liées au ticker via yfinance."""
    try:
        news_items = getattr(yf.Ticker(ticker_symbol), "news", []) or []
    except Exception:
        news_items = []

    cleaned: List[Dict[str, Any]] = []
    for item in news_items:
        title = item.get("title")
        link = item.get("link")
        if not title or not link:
            continue
        publisher = item.get("publisher")
        ts = item.get("providerPublishTime")
        if ts:
            try:
                published_at = pd.to_datetime(ts, unit="s").isoformat()
            except Exception:
                published_at = None
        else:
            published_at = None
        cleaned.append(
            {
                "title": title,
                "link": link,
                "publisher": publisher,
                "published_at": published_at,
            }
        )
        if len(cleaned) >= limit:
            break
    return cleaned


def fetch_financial_data(ticker_symbol: str, sector_override: Optional[str] = None) -> Tuple[FinancialData, List[str]]:
    ticker_obj = yf.Ticker(ticker_symbol)
    assumptions: List[str] = []

    try:
        info = ticker_obj.get_info()
    except Exception:
        info = getattr(ticker_obj, "info", {}) or {}

    fast_info = getattr(ticker_obj, "fast_info", {}) or {}
    if hasattr(fast_info, "__dict__"):
        fast_info = fast_info.__dict__

    price = safe_first(
        fast_info.get("lastPrice"),
        fast_info.get("regularMarketPrice"),
        info.get("regularMarketPrice"),
        info.get("currentPrice"),
        info.get("previousClose"),
    )

    currency = safe_first(fast_info.get("currency"), info.get("currency"))
    eps = safe_first(info.get("trailingEps"), info.get("epsTrailingTwelveMonths"))
    growth = normalize_growth(
        safe_first(info.get("earningsGrowth"), info.get("earningsQuarterlyGrowth"), info.get("revenueQuarterlyGrowth"))
    )
    if growth is None:
        try:
            trend = ticker_obj.earnings_trend
            if trend is not None and not trend.empty:
                if "growth" in trend.columns:
                    current_growth = trend.loc["0y"].get("growth")
                    growth = normalize_growth(current_growth)
        except Exception:
            growth = None

    book_value_per_share = safe_first(info.get("bookValue"), info.get("bookValuePerShare"))
    shares_outstanding = safe_first(info.get("sharesOutstanding"), info.get("floatShares"))
    equity = compute_equity(book_value_per_share, shares_outstanding, info.get("totalStockholderEquity"))

    total_debt = info.get("totalDebt")
    total_cash = info.get("totalCash")
    net_debt = safe_first(info.get("netDebt"), (total_debt or 0) - (total_cash or 0))
    free_cash_flow = fetch_free_cash_flow(ticker_obj)
    market_cap = safe_first(info.get("marketCap"), (price or 0) * (shares_outstanding or 0))
    dividend_rate = info.get("dividendRate")
    revenue = info.get("totalRevenue")
    net_income = safe_first(info.get("netIncomeToCommon"), info.get("netIncome"))
    ebitda = info.get("ebitda")
    roe = info.get("returnOnEquity")
    roa = info.get("returnOnAssets")
    payout_ratio = info.get("payoutRatio")
    beta = info.get("beta")
    sector = sector_override or info.get("sector")
    industry = info.get("industry")
    name = info.get("longName") or info.get("shortName") or ticker_symbol.upper()

    if sector is None:
        assumptions.append("Secteur non fourni par Yahoo Finance → utilisation du profil 'Default'.")

    sector_key = sector if sector in SECTOR_MULTIPLES else "Default"
    sector_multiples = SECTOR_MULTIPLES[sector_key]

    historical_multiples = fetch_historical_multiples(ticker_obj, shares_outstanding, net_debt)

    financial_data = FinancialData(
        ticker=ticker_symbol.upper(),
        name=name,
        sector=sector,
        industry=industry,
        currency=currency,
        price=price,
        eps=eps,
        growth_rate=growth,
        book_value_per_share=book_value_per_share,
        shares_outstanding=shares_outstanding,
        equity=equity,
        total_debt=total_debt,
        total_cash=total_cash,
        net_debt=net_debt,
        free_cash_flow=free_cash_flow,
        market_cap=market_cap,
        dividend=dividend_rate,
        revenue=revenue,
        net_income=net_income,
        ebitda=ebitda,
        roe=roe,
        roa=roa,
        payout_ratio=payout_ratio,
        beta=beta,
        sector_multiples=sector_multiples,
        historical_multiples=historical_multiples,
    )

    return financial_data, assumptions


def prompt_missing_value(
    label: str,
    current_value: Optional[float],
    unit: str,
    allow_negative: bool = False,
) -> Optional[float]:
    if current_value is not None or not sys.stdin.isatty():
        return current_value
    while True:
        raw = input(f"{label} manquant. Veuillez entrer une valeur en {unit} (laisser vide pour ignorer) : ").strip()
        if not raw:
            return None
        try:
            value = float(raw.replace(",", "."))
            if not allow_negative and value < 0:
                print("Merci d'entrer une valeur positive.")
                continue
            return value
        except ValueError:
            print("Valeur invalide, recommencez.")


def fill_critical_gaps(data: FinancialData, no_prompt: bool, assumptions: List[str]) -> None:
    if no_prompt:
        return
    prompts = [
        ("Prix de l'action", "price", data.currency or "devise locale", False),
        ("Bénéfice par action (Earnings per Share)", "eps", data.currency or "devise locale", False),
        ("Taux de croissance attendu (%)", "growth_rate", "%", True),
        ("Valeur comptable par action", "book_value_per_share", data.currency or "devise locale", False),
        ("Free Cash Flow dernière année", "free_cash_flow", data.currency or "devise locale", True),
    ]
    for label, attr, unit, allow_negative in prompts:
        value = getattr(data, attr)
        if attr == "growth_rate" and value is None:
            user_input = prompt_missing_value(label, None, unit, allow_negative)
            if user_input is not None:
                if user_input > 1:
                    setattr(data, attr, user_input / 100.0)
                    assumptions.append(f"Taux de croissance fourni manuellement ({user_input:.2f} %).")
                else:
                    setattr(data, attr, user_input)
                    assumptions.append(f"Taux de croissance fourni manuellement ({user_input*100:.2f} %).")
            continue
        if value is None:
            user_input = prompt_missing_value(label, None, unit, allow_negative)
            if user_input is not None:
                setattr(data, attr, user_input)
                assumptions.append(f"{label} saisi manuellement ({user_input}).")


def safe_div(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator in (None, 0):
        return None
    try:
        return numerator / denominator
    except ZeroDivisionError:
        return None


def format_number(value: Optional[float], currency: bool = False, decimals: int = 2, suffix: str = "") -> str:
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return "N/A"
    if currency:
        formatted = f"{value:,.{decimals}f}"
        return f"{formatted} {suffix}".strip()
    formatted = f"{value:,.{decimals}f}"
    return f"{formatted}{suffix}"


def format_percent(value: Optional[float], decimals: int = 1) -> str:
    if value is None:
        return "N/A"
    return f"{value*100:.{decimals}f}%"


def to_number(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (float, int)):
        if math.isnan(value) or math.isinf(value):
            return None
        return float(value)
    return None


def consistency_checks(data: FinancialData) -> List[str]:
    issues: List[str] = []
    if data.market_cap and data.price and data.shares_outstanding:
        implied = data.price * data.shares_outstanding
        diff = abs(implied - data.market_cap) / data.market_cap if data.market_cap else 0
        if diff > 0.1:
            issues.append(
                f"Capitalisation implicite ({implied:,.0f}) éloignée de celle reportée ({data.market_cap:,.0f})."
            )
    if data.net_income and data.shares_outstanding and data.eps:
        derived_eps = data.net_income / data.shares_outstanding
        diff = abs(derived_eps - data.eps) / abs(data.eps) if data.eps else None
        if diff and diff > 0.2:
            issues.append("Bénéfice par action incohérent avec le bénéfice net déclaré (>20 % d'écart).")
    if data.equity and data.book_value_per_share and data.shares_outstanding:
        implied_equity = data.book_value_per_share * data.shares_outstanding
        diff = abs(implied_equity - data.equity) / data.equity if data.equity else 0
        if diff > 0.25:
            issues.append("Capitaux propres calculés et reportés divergent de plus de 25 %. ")
    return issues


def ratio_verdict_pe(value: Optional[float], sector_avg: Optional[float]) -> str:
    if value is None or sector_avg is None:
        return "Donnée insuffisante"
    low = 0.8 * sector_avg
    high = 1.2 * sector_avg
    if value < low:
        return "SOUS-ÉVALUÉ"
    if value <= high:
        return "NEUTRE"
    return "SURÉVALUÉ"


def ratio_verdict_pb(value: Optional[float]) -> str:
    if value is None:
        return "Donnée insuffisante"
    if value < 1.0:
        return "SOUS-ÉVALUÉ"
    if value <= 3.0:
        return "NEUTRE"
    return "SURÉVALUÉ"


def ratio_verdict_ps(value: Optional[float], sector_avg: Optional[float]) -> str:
    if value is None or sector_avg is None:
        return "Donnée insuffisante"
    low = 0.85 * sector_avg
    high = 1.15 * sector_avg
    if value < low:
        return "SOUS-ÉVALUÉ"
    if value <= high:
        return "NEUTRE"
    return "SURÉVALUÉ"


def ratio_verdict_ev_ebitda(value: Optional[float], sector_avg: Optional[float]) -> str:
    if value is None or sector_avg is None:
        return "Donnée insuffisante"
    low = 0.85 * sector_avg
    high = 1.15 * sector_avg
    if value < low:
        return "SOUS-ÉVALUÉ"
    if value <= high:
        return "NEUTRE"
    return "SURÉVALUÉ"


def ratio_verdict_peg(value: Optional[float]) -> str:
    if value is None:
        return "Donnée insuffisante"
    if value < 1.0:
        return "SOUS-ÉVALUÉ"
    if abs(value - 1.0) <= 0.05:
        return "NEUTRE"
    return "SURÉVALUÉ"


def compute_ratios(data: FinancialData) -> List[Dict[str, Any]]:
    sector_multiples = data.sector_multiples
    hist = data.historical_multiples
    pe_value = safe_div(data.price, data.eps)
    growth_percent = (data.growth_rate * 100) if data.growth_rate is not None else None
    peg_value = safe_div(pe_value, growth_percent) if growth_percent else None
    pb_value = safe_div(data.price, data.book_value_per_share)
    ps_value = safe_div(data.market_cap, data.revenue) if data.market_cap and data.revenue else None
    ebitda = data.ebitda
    enterprise_value = (data.market_cap or 0) + (data.net_debt or 0)
    ev_ebitda_value = safe_div(enterprise_value, ebitda)

    ratios = [
        {
            "name": "Price to Earnings",
            "formula": "P/E = Prix / BPA",
            "calculation": f"{format_number(data.price, True)} / {format_number(data.eps, True)}",
            "value": pe_value,
            "sector": sector_multiples.get("pe"),
            "history": hist.get("pe"),
            "verdict": ratio_verdict_pe(pe_value, sector_multiples.get("pe")),
        },
        {
            "name": "Price to Earnings Growth",
            "formula": "PEG = P/E / Croissance (%)",
            "calculation": f"{format_number(pe_value)} / {format_number(growth_percent, False)}",
            "value": peg_value,
            "sector": None,
            "history": None,
            "verdict": ratio_verdict_peg(peg_value),
        },
        {
            "name": "Price to Book",
            "formula": "P/B = Prix / Valeur comptable par action",
            "calculation": f"{format_number(data.price, True)} / {format_number(data.book_value_per_share, True)}",
            "value": pb_value,
            "sector": sector_multiples.get("pb"),
            "history": hist.get("pb"),
            "verdict": ratio_verdict_pb(pb_value),
        },
        {
            "name": "Price to Sales",
            "formula": "P/S = Capitalisation / Revenu",
            "calculation": f"{format_number(data.market_cap, True)} / {format_number(data.revenue, True)}",
            "value": ps_value,
            "sector": sector_multiples.get("ps"),
            "history": hist.get("ps"),
            "verdict": ratio_verdict_ps(ps_value, sector_multiples.get("ps")),
        },
        {
            "name": "Enterprise Value / EBITDA",
            "formula": "EV/EBITDA = Valeur d'entreprise / EBITDA",
            "calculation": f"{format_number(enterprise_value, True)} / {format_number(ebitda, True)}",
            "value": ev_ebitda_value,
            "sector": sector_multiples.get("ev_ebitda"),
            "history": hist.get("ev_ebitda"),
            "verdict": ratio_verdict_ev_ebitda(ev_ebitda_value, sector_multiples.get("ev_ebitda")),
        },
    ]
    return ratios


def run_dcf(
    data: FinancialData,
    wacc: float,
    terminal_growth: float,
    growth_override: Optional[float] = None,
) -> Dict[str, Any]:
    if data.free_cash_flow is None or data.free_cash_flow == 0 or data.shares_outstanding is None:
        return {
            "fcf_forecast": [],
            "pv_terminal": None,
            "intrinsic_value": None,
            "equity_value": None,
            "enterprise_value": None,
            "terminal_value": None,
            "growth_source": "insufficient_data",
        }
    if growth_override is not None:
        growth_rate = growth_override
        growth_source = "scenario_override"
    elif data.growth_rate is None:
        growth_rate = 0.05
        growth_source = "assumed_default"
    else:
        growth_rate = data.growth_rate
        growth_source = "reported"
    fcf = data.free_cash_flow
    projections = []
    for year in range(1, 6):
        fcf = fcf * (1 + growth_rate)
        pv = fcf / ((1 + wacc) ** year)
        projections.append({"year": year, "fcf": fcf, "pv": pv})
    effective_terminal = min(max(terminal_growth, 0.0), wacc - 0.005)
    terminal_cash_flow = projections[-1]["fcf"] * (1 + effective_terminal)
    terminal_value = terminal_cash_flow / (wacc - effective_terminal)
    pv_terminal = terminal_value / ((1 + wacc) ** 5)
    enterprise_value = pv_terminal + sum(row["pv"] for row in projections)
    equity_value = enterprise_value - (data.net_debt or 0)
    intrinsic_value = equity_value / data.shares_outstanding
    return {
        "fcf_forecast": projections,
        "pv_terminal": pv_terminal,
        "terminal_value": terminal_value,
        "enterprise_value": enterprise_value,
        "equity_value": equity_value,
        "intrinsic_value": intrinsic_value,
        "growth_source": growth_source,
    }


def run_dcf_scenarios(
    data: FinancialData,
    wacc: float,
    terminal_growth: float,
) -> Dict[str, Any]:
    scenarios_output: List[Dict[str, Optional[float]]] = []
    weighted_values: List[float] = []
    for scenario in SCENARIO_CONFIG:
        scenario_growth = (
            (data.growth_rate or 0.05) * scenario["growth_mult"] if data.growth_rate is not None else 0.05 * scenario["growth_mult"]
        )
        scenario_wacc = max(0.02, wacc + scenario["wacc_delta"])
        scenario_terminal = max(0.0, terminal_growth + scenario["terminal_delta"])
        result = run_dcf(data, scenario_wacc, scenario_terminal, scenario_growth)
        intrinsic = result.get("intrinsic_value")
        scenarios_output.append(
            {
                "name": scenario["name"],
                "wacc": scenario_wacc,
                "growth_rate": scenario_growth,
                "terminal_growth": scenario_terminal,
                "intrinsic_value": intrinsic,
                "weight": scenario["weight"],
            }
        )
        if intrinsic:
            weighted_values.append(intrinsic * scenario["weight"])
    weighted_intrinsic = sum(weighted_values) if weighted_values else None
    return {"scenarios": scenarios_output, "weighted_intrinsic_value": weighted_intrinsic}


def run_monte_carlo(
    data: FinancialData,
    base_wacc: float,
    base_growth: float,
    iterations: int = 150,
) -> Dict[str, Optional[float]]:
    if data.free_cash_flow is None or data.shares_outstanding is None:
        return {"iterations": 0, "median": None, "min": None, "max": None}
    values: List[float] = []
    for _ in range(iterations):
        random_wacc = max(0.02, random.gauss(base_wacc, 0.01))
        random_growth = max(0.0, random.gauss(base_growth, 0.02))
        random_terminal = max(0.0, random_growth / 2)
        result = run_dcf(data, random_wacc, random_terminal, random_growth)
        intrinsic = result.get("intrinsic_value")
        if intrinsic:
            values.append(intrinsic)
    if not values:
        return {"iterations": iterations, "median": None, "min": None, "max": None}
    return {
        "iterations": iterations,
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def score_health(data: FinancialData) -> float:
    if data.equity and data.equity != 0 and data.net_debt is not None:
        debt_to_equity = data.net_debt / data.equity
    else:
        debt_to_equity = None
    score = 70.0
    if debt_to_equity is not None:
        if debt_to_equity < 0:
            score = 90.0
        elif debt_to_equity < 0.2:
            score = 80.0
        elif debt_to_equity < 0.5:
            score = 70.0
        elif debt_to_equity < 1:
            score = 55.0
        else:
            score = 40.0
    if data.payout_ratio is not None:
        if data.payout_ratio < 0.5:
            score += 5
        elif data.payout_ratio > 0.9:
            score -= 10
    return max(0, min(100, score))


def score_growth(data: FinancialData) -> float:
    growth = data.growth_rate
    if growth is None:
        return 50.0
    if growth >= 0.2:
        return 90.0
    if growth >= 0.1:
        return 75.0
    if growth >= 0.05:
        return 60.0
    if growth >= 0.0:
        return 45.0
    return 30.0


def score_valuation(ratios: List[Dict[str, Any]]) -> float:
    mapping = {"SOUS-ÉVALUÉ": 90, "NEUTRE": 60, "SURÉVALUÉ": 30}
    collected = []
    for ratio in ratios:
        verdict = ratio["verdict"]
        if verdict in mapping:
            collected.append(mapping[verdict])
    if not collected:
        return 50.0
    return float(np.mean(collected))


def score_risk(data: FinancialData) -> float:
    beta = data.beta or 1.0
    if beta < 0.8:
        score = 85.0
    elif beta < 1.1:
        score = 70.0
    elif beta < 1.5:
        score = 55.0
    else:
        score = 40.0
    if data.net_debt and data.ebitda:
        leverage = data.net_debt / data.ebitda
        if leverage < 1:
            score += 5
        elif leverage > 3:
            score -= 10
    return max(0, min(100, score))


def aggregate_scores(
    data: FinancialData, ratios: List[Dict[str, Any]]
) -> Dict[str, float]:
    health = score_health(data)
    growth = score_growth(data)
    valuation = score_valuation(ratios)
    risk = score_risk(data)
    overall = 0.25 * (health + growth + valuation + risk)
    return {"santé": health, "croissance": growth, "valorisation": valuation, "risque": risk, "score_total": overall}


def compute_roic(data: FinancialData) -> Optional[float]:
    if data.net_income is None:
        return None
    invested_capital = None
    if data.equity is not None and data.total_debt is not None:
        invested_capital = data.equity + data.total_debt - (data.total_cash or 0)
    if invested_capital and invested_capital != 0:
        return data.net_income / invested_capital
    return None


def compute_fcf_yield(data: FinancialData) -> Optional[float]:
    if data.free_cash_flow is None or not data.market_cap:
        return None
    return data.free_cash_flow / data.market_cap


def compute_operating_margin(data: FinancialData) -> Optional[float]:
    if data.net_income is None or data.revenue is None or data.revenue == 0:
        return None
    return data.net_income / data.revenue


def compute_piotroski_score(data: FinancialData, roic: Optional[float], fcf_yield: Optional[float]) -> Optional[int]:
    score = 0
    metrics_available = False
    if data.net_income is not None:
        metrics_available = True
        if data.net_income > 0:
            score += 1
    if data.free_cash_flow is not None:
        metrics_available = True
        if data.free_cash_flow > 0:
            score += 1
    if data.growth_rate is not None:
        metrics_available = True
        if data.growth_rate > 0:
            score += 1
    if data.net_debt is not None:
        metrics_available = True
        if data.net_debt <= 0:
            score += 1
    if data.payout_ratio is not None:
        metrics_available = True
        if 0 < data.payout_ratio < 0.7:
            score += 1
    if data.roe is not None and data.roe > 0.15:
        metrics_available = True
        score += 1
    if roic is not None and roic > 0.1:
        score += 1
    if fcf_yield is not None and fcf_yield > 0.05:
        score += 1
    margin = compute_operating_margin(data)
    if margin is not None and margin > 0.1:
        score += 1
    return score if metrics_available else None


def compute_z_score(data: FinancialData) -> Optional[float]:
    equity = data.equity or 0
    total_debt = data.total_debt or 0
    assets = equity + total_debt
    if assets <= 0:
        return None
    working_capital = (data.total_cash or 0) - max(data.net_debt or 0, 0)
    retained_earnings = data.net_income or 0
    ebit = (data.ebitda or data.net_income or 0) * 0.8
    market_value_equity = data.market_cap or 0
    revenue = data.revenue or 0
    liabilities = total_debt if total_debt > 0 else 1.0
    z = (
        1.2 * (working_capital / assets)
        + 1.4 * (retained_earnings / assets)
        + 3.3 * (ebit / assets)
        + 0.6 * (market_value_equity / liabilities)
        + 1.0 * (revenue / assets)
    )
    return z


def compute_advanced_metrics(data: FinancialData) -> Dict[str, Optional[float]]:
    roic = compute_roic(data)
    fcf_yield = compute_fcf_yield(data)
    margin = compute_operating_margin(data)
    piotroski = compute_piotroski_score(data, roic, fcf_yield)
    z_score = compute_z_score(data)
    return {
        "roic": roic,
        "fcf_yield": fcf_yield,
        "operating_margin": margin,
        "piotroski_score": piotroski,
        "z_score": z_score,
    }


def build_key_data_section(data: FinancialData, consistency: List[str]) -> Dict[str, Any]:
    notes = consistency.copy()
    required_fields = [
        ("price", "Prix actuel"),
        ("eps", "Bénéfice par action"),
        ("revenue", "Revenu"),
        ("net_income", "Bénéfice net"),
        ("free_cash_flow", "Free Cash Flow"),
        ("net_debt", "Dette nette"),
        ("growth_rate", "Croissance attendue"),
        ("roe", "Return on Equity"),
        ("roa", "Return on Assets"),
        ("payout_ratio", "Payout ratio"),
    ]
    for attr, label in required_fields:
        if to_number(getattr(data, attr)) is None:
            notes.append(f"{label} manquant")
    margin = safe_div(data.net_income, data.revenue)
    return {
        "prix_actuel": to_number(data.price),
        "EPS": to_number(data.eps),
        "revenu": to_number(data.revenue),
        "benefice_net": to_number(data.net_income),
        "FCF": to_number(data.free_cash_flow),
        "dette": to_number(data.net_debt if data.net_debt is not None else data.total_debt),
        "croissance": to_number(data.growth_rate),
        "marge": to_number(margin),
        "ROE": to_number(data.roe),
        "ROA": to_number(data.roa),
        "payout_ratio": to_number(data.payout_ratio),
        "sector_multiples": {
            "PE": to_number(data.sector_multiples.get("pe")),
            "PB": to_number(data.sector_multiples.get("pb")),
            "EV_EBITDA": to_number(data.sector_multiples.get("ev_ebitda")),
            "PS": to_number(data.sector_multiples.get("ps")),
        },
        "notes": notes,
    }


def build_multiples_section(ratios: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for ratio in ratios:
        formatted.append(
            {
                "ratio": ratio["name"],
                "formula": ratio.get("formula"),
                "calculation": ratio.get("calculation"),
                "value": to_number(ratio["value"]),
                "sector": to_number(ratio["sector"]),
                "historic_5y": to_number(ratio["history"]),
                "verdict": ratio["verdict"],
            }
        )
    return formatted


def describe_price_gap(price: Optional[float], intrinsic: Optional[float]) -> str:
    if price is None or intrinsic is None:
        return "Comparaison impossible (données manquantes)"
    gap = (price - intrinsic) / intrinsic
    if abs(gap) < 0.01:
        return "Prix aligné sur la valeur intrinsèque"
    direction = "surévaluée" if gap > 0 else "sous-évaluée"
    return f"Action {direction} de {abs(gap)*100:.1f}%"


def build_dcf_section(
    data: FinancialData,
    dcf: Dict[str, Any],
    wacc: float,
    assumptions: List[str],
) -> Dict[str, Any]:
    notes = list(assumptions)
    growth_source = dcf.get("growth_source")
    if growth_source == "assumed_default":
        notes.append("Taux de croissance par défaut utilisé (5%).")
    if not dcf["fcf_forecast"]:
        notes.append("Discounted Cash Flow impossible : Free Cash Flow ou actions manquants.")
        return {
            "fcf_croissance_5y": None,
            "valeur_terminale": None,
            "wacc": wacc,
            "valeur_intrinseque_action": None,
            "prix_actuel": to_number(data.price),
            "comparaison": "Calcul de valeur intrinsèque indisponible",
            "notes": notes,
        }
    pv_sum = sum(row["pv"] for row in dcf["fcf_forecast"])
    intrinsic = dcf.get("intrinsic_value")
    comparaison = describe_price_gap(data.price, intrinsic)
    return {
        "fcf_croissance_5y": to_number(pv_sum),
        "valeur_terminale": to_number(dcf.get("terminal_value")),
        "wacc": wacc,
        "valeur_intrinseque_action": to_number(intrinsic),
        "prix_actuel": to_number(data.price),
        "comparaison": comparaison,
        "notes": notes,
    }


def build_verdict_section(verdict: str, reason: str) -> Dict[str, str]:
    # limiter à trois phrases/lignes maximum
    sentences = reason.split(". ")
    trimmed_reason = ". ".join(sentences[:3]).strip()
    return {"etat": verdict, "explication": trimmed_reason}


def build_resume(resume_lines: List[str]) -> str:
    limited = resume_lines[:10]
    return "\n".join(limited)


def build_recommandation_section(
    signal: str,
    horizon: str,
    risks: List[str],
    catalysts: List[str],
) -> Dict[str, Any]:
    return {
        "signal": signal,
        "horizon": horizon,
        "principaux_risques": risks,
        "principaux_catalyseurs": catalysts,
    }


def build_catalysts(
    data: FinancialData,
    scores: Dict[str, float],
    dcf: Dict[str, Any],
    ratios: List[Dict[str, Any]],
) -> List[str]:
    catalysts: List[str] = []
    if data.growth_rate and data.growth_rate > 0.1:
        catalysts.append("Fort potentiel de croissance organique (>10 % annuel)")
    if data.free_cash_flow and data.free_cash_flow > 0 and (data.dividend or 0) > 0:
        catalysts.append("Distribution de cash attractive (dividendes ou rachats)")
    if scores["valorisation"] >= 70:
        catalysts.append("Multiples attractifs vs. secteur (valorisation sous la moyenne)")
    if data.net_debt is not None and data.net_debt < 0:
        catalysts.append("Bilan net cash permettant des acquisitions opportunistes")
    catalysts.append("Initiatives stratégiques : innovation produit, expansion géographique ou gains de marge")
    return catalysts[:4]


def build_risk_points(
    data: FinancialData,
    scores: Dict[str, float],
    dcf: Dict[str, Any],
    ratios: List[Dict[str, Any]],
) -> List[str]:
    risks: List[str] = []
    if data.growth_rate is None or data.growth_rate < 0.03:
        risks.append("Visibilité limitée sur la croissance des revenus (<3 % ou inconnue)")
    if data.net_debt and data.ebitda and data.ebitda > 0 and data.net_debt / data.ebitda > 3:
        risks.append("Levier financier élevé (Dette nette / EBITDA > 3x)")
    if data.free_cash_flow is None or data.free_cash_flow < 0:
        risks.append("Free Cash Flow fragile ou négatif")
    if scores["risque"] < 50:
        risks.append("Beta et volatilité supérieurs aux pairs (profil risque élevé)")
    risks.append("Sensibilité aux cycles macroéconomiques et à la réglementation du secteur")
    return risks[:4]


def derive_verdict(price: Optional[float], intrinsic: Optional[float], score: float) -> Tuple[str, str]:
    if price is None or intrinsic is None:
        if score >= 70:
            return "🟢 Sous-évaluée", "Score qualitatif élevé mais valorisation Discounted Cash Flow non disponible."
        if score <= 45:
            return "🔴 Surévaluée", "Score qualitatif faible et absence de valorisation Discounted Cash Flow fiable."
        return "⚪ Neutre", "Manque de données Discounted Cash Flow, jugement basé uniquement sur les scores."
    discount = (price - intrinsic) / intrinsic
    if discount <= -0.15:
        verdict = "🟢 Sous-évaluée"
        reason = f"Prix ({format_number(price, True)}) inférieur de {abs(discount)*100:.1f}% à la valeur intrinsèque estimée ({format_number(intrinsic, True)})."
    elif discount >= 0.15:
        verdict = "🔴 Surévaluée"
        reason = f"Prix supérieur de {discount*100:.1f}% à la valeur intrinsèque estimée ({format_number(intrinsic, True)})."
    else:
        verdict = "⚪ Neutre"
        reason = f"Prix proche de la valeur intrinsèque (écart {discount*100:.1f}%)."
    return verdict, reason


def build_investor_summary(data: FinancialData, ratios: List[Dict[str, Any]], dcf: Dict[str, Any]) -> List[str]:
    lines: List[str] = []
    lines.append(f"{data.name} ({data.ticker}) - secteur {data.sector or 'N/A'} / industrie {data.industry or 'N/A'}.")
    lines.append(f"Prix actuel : {format_number(data.price, True, decimals=2, suffix=data.currency or '')}.")
    lines.append(
        f"Croissance attendue : {format_percent(data.growth_rate)} ; Return on Equity : {format_percent(data.roe)}."
    )
    pe_ratio = next((r for r in ratios if r["name"] == "Price to Earnings"), None)
    if pe_ratio:
        lines.append(
            f"Price to Earnings actuel {format_number(pe_ratio['value'])} vs secteur {format_number(pe_ratio['sector'])}."
        )
    ps_ratio = next((r for r in ratios if r["name"] == "Price to Sales"), None)
    if ps_ratio:
        lines.append(f"Price to Sales {format_number(ps_ratio['value'])} (secteur {format_number(ps_ratio['sector'])}).")
    lines.append(
        f"Free Cash Flow utilisé pour le Discounted Cash Flow : {format_number(data.free_cash_flow, True, decimals=0, suffix=data.currency or '')}."
    )
    intrinsic = dcf.get("intrinsic_value")
    if intrinsic:
        lines.append(f"Valeur intrinsèque estimée : {format_number(intrinsic, True, decimals=2, suffix=data.currency or '')}.")
    lines.append(f"Dette nette : {format_number(data.net_debt, True, decimals=0, suffix=data.currency or '')}.")
    lines.append(f"Dividende par action : {format_number(data.dividend, True, decimals=2, suffix=data.currency or '')}.")
    lines.append("Voir les scores pour la synthèse santé/croissance/valorisation/risque.")
    return lines[:10]


def recommendation_action(verdict: str, score: float) -> Tuple[str, str]:
    if verdict.startswith("🟢") and score >= 70:
        return "Achat", "Long terme (≥3 ans)"
    if verdict.startswith("🔴") and score <= 50:
        return "Vente", "Court à moyen terme (≤1 an)"
    return "Attente", "Moyen terme (12-24 mois)"


OVERRIDE_LABELS = {
    "price": "Prix actuel",
    "eps": "Earnings per Share",
    "growth_rate": "Croissance attendue",
    "book_value_per_share": "Valeur comptable par action",
    "shares_outstanding": "Actions en circulation",
    "free_cash_flow": "Free Cash Flow",
}


def apply_overrides_to_data(data: FinancialData, overrides: Optional[Dict[str, float]], assumptions: List[str]) -> None:
    if not overrides:
        return
    for attr, value in overrides.items():
        if value is None or not hasattr(data, attr):
            continue
        setattr(data, attr, value)
        label = OVERRIDE_LABELS.get(attr, attr)
        if attr == "growth_rate":
            assumptions.append(f"{label} forcée à {value*100:.2f} %.")
        else:
            assumptions.append(f"{label} forcé à {value}.")


def run_analysis_pipeline(
    ticker: str,
    wacc: float,
    terminal_growth: float,
    sector_override: Optional[str] = None,
    allow_prompts: bool = True,
    overrides: Optional[Dict[str, float]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    normalized_ticker = ticker.strip().upper()
    data, assumptions = fetch_financial_data(normalized_ticker, sector_override)
    if not has_core_data(data):
        resolved_symbol, company_name = search_symbol(ticker)
        if resolved_symbol and resolved_symbol != normalized_ticker:
            data, new_assumptions = fetch_financial_data(resolved_symbol, sector_override)
            assumptions.extend(new_assumptions)
            note = (
                f"Nom '{ticker}' mappé automatiquement sur le ticker {resolved_symbol}"
                + (f" ({company_name})." if company_name else ".")
            )
            assumptions.append(note)
    apply_overrides_to_data(data, overrides, assumptions)
    fill_critical_gaps(data, no_prompt=not allow_prompts, assumptions=assumptions)

    ratio_results = compute_ratios(data)
    dcf = run_dcf(data, wacc, terminal_growth)
    scenario_block = run_dcf_scenarios(data, wacc, terminal_growth)
    monte_carlo = run_monte_carlo(data, wacc, data.growth_rate or 0.05)
    advanced_metrics = compute_advanced_metrics(data)
    scores = aggregate_scores(data, ratio_results)
    verdict, verdict_reason = derive_verdict(data.price, dcf.get("intrinsic_value"), scores["score_total"])
    summary_lines = build_investor_summary(data, ratio_results, dcf)
    rec_action, rec_horizon = recommendation_action(verdict, scores["score_total"])
    price_history = fetch_price_history(data.ticker)
    benchmark_history = fetch_price_history("SPY")
    benchmark_ticker = "SPY" if benchmark_history else None
    if not benchmark_history:
        alt_history = fetch_price_history("^GSPC")
        if alt_history:
            benchmark_history = alt_history
            benchmark_ticker = "^GSPC"
    vix_history = fetch_price_history("^VIX", period="6mo", interval="1wk")
    vix_level = vix_history[-1]["close"] if vix_history else None
    macro_risk = {
        "vix": vix_level,
        "level": "elevated" if vix_level and vix_level > 20 else ("high" if vix_level and vix_level > 30 else "moderate"),
    }
    news = fetch_company_news(data.ticker)

    checks = consistency_checks(data)
    key_data_section = build_key_data_section(data, checks)
    multiples_section = build_multiples_section(ratio_results)
    dcf_section = build_dcf_section(data, dcf, wacc, assumptions)
    scoring_section = {
        "sante_financiere": scores["santé"],
        "croissance": scores["croissance"],
        "valorisation": scores["valorisation"],
        "risque": scores["risque"],
        "score_total": scores["score_total"],
    }
    verdict_section = build_verdict_section(verdict, verdict_reason)
    resume_text = build_resume(summary_lines)
    risk_points = build_risk_points(data, scores, dcf, ratio_results)
    catalysts = build_catalysts(data, scores, dcf, ratio_results)
    recommandation_section = build_recommandation_section(rec_action, rec_horizon, risk_points, catalysts)

    payload = {
        "ticker": data.ticker,
        "key_data": key_data_section,
        "multiples_analysis": multiples_section,
        "dcf": dcf_section,
        "dcf_scenarios": scenario_block,
        "monte_carlo": monte_carlo,
        "advanced_metrics": advanced_metrics,
        "scoring": scoring_section,
        "verdict_final": verdict_section,
        "resume_investisseur": resume_text,
        "recommandation": recommandation_section,
        "price_history": price_history,
        "benchmark_history": benchmark_history,
        "benchmark_ticker": benchmark_ticker,
        "macro_risk": macro_risk,
        "news": news,
        "erreur": None,
    }

    context = {
        "data": data,
        "assumptions": assumptions,
        "ratios": ratio_results,
        "dcf": dcf,
        "scores": scores,
        "summary_lines": summary_lines,
        "verdict": verdict,
        "verdict_reason": verdict_reason,
        "rec_action": rec_action,
        "rec_horizon": rec_horizon,
        "checks": checks,
        "risk_points": risk_points,
        "catalysts": catalysts,
        "dcf_scenarios": scenario_block,
        "advanced_metrics": advanced_metrics,
        "monte_carlo": monte_carlo,
        "price_history": price_history,
        "benchmark_history": benchmark_history,
        "benchmark_ticker": benchmark_ticker,
        "macro_risk": macro_risk,
        "news": news,
    }
    return payload, context


def main() -> None:
    args = parse_args()
    ticker = args.ticker.strip().upper()
    if not ticker:
        error_payload = {"ticker": args.ticker, "erreur": "Ticker non reconnu ou introuvable dans la base de données."}
        print(json.dumps(error_payload, ensure_ascii=False, indent=2))
        return
    try:
        payload, _ = run_analysis_pipeline(
            ticker,
            args.wacc,
            args.terminal_growth,
            sector_override=args.sector,
            allow_prompts=not args.no_prompt,
        )
    except Exception as exc:
        error_payload = {"ticker": ticker, "erreur": f"Impossible de récupérer les données ({exc})."}
        print(json.dumps(error_payload, ensure_ascii=False, indent=2))
        return

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
