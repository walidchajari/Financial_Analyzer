#!/usr/bin/env python3
"""
Petit utilitaire invoqué depuis le frontend Next.js.
Il lit un JSON sur l'entrée standard, exécute run_analysis_pipeline
et renvoie la réponse JSON sérialisée ou un objet d'erreur.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from backend.app import DEFAULT_TERMINAL_GROWTH, DEFAULT_WACC, run_analysis_pipeline

ALLOWED_OVERRIDES = {
    "price",
    "eps",
    "growth_rate",
    "book_value_per_share",
    "shares_outstanding",
    "free_cash_flow",
}


def to_float(value: Any, fallback: float) -> float:
    try:
        if value is None:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def parse_overrides(values: Optional[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    if not values:
        return None
    overrides: Dict[str, float] = {}
    for key, raw in values.items():
        if key not in ALLOWED_OVERRIDES:
            continue
        try:
            overrides[key] = float(raw)
        except (TypeError, ValueError):
            continue
    return overrides or None


def main() -> None:
    raw_payload = sys.stdin.read()
    if not raw_payload.strip():
        print(json.dumps({"error": "Payload JSON requis."}, ensure_ascii=False))
        sys.exit(1)
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Payload JSON invalide."}, ensure_ascii=False))
        sys.exit(1)

    ticker = (payload.get("ticker") or "").strip().upper()
    if not ticker:
        print(json.dumps({"error": "Ticker requis."}, ensure_ascii=False))
        sys.exit(1)

    wacc = to_float(payload.get("wacc"), DEFAULT_WACC)
    terminal_growth = to_float(payload.get("terminalGrowth"), DEFAULT_TERMINAL_GROWTH)
    sector = payload.get("sector")
    overrides = parse_overrides(payload.get("overrides"))

    try:
        result, _context = run_analysis_pipeline(
            ticker,
            wacc,
            terminal_growth,
            sector_override=sector,
            allow_prompts=False,
            overrides=overrides,
        )
    except Exception as exc:  # pragma: no cover - surface message for the frontend
        print(json.dumps({"error": f"Analyse impossible : {exc}"}, ensure_ascii=False))
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
