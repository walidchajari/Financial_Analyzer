from __future__ import annotations

from typing import Any, Dict

from backend.server.models import AnalysisRequest


def cache_key(payload: AnalysisRequest) -> str:
    overrides_serialized = str(sorted((payload.overrides or {}).items()))
    sector = payload.sector or ""
    return "|".join(
        [
            payload.ticker,
            f"{payload.wacc:.4f}",
            f"{payload.terminalGrowth:.4f}",
            sector,
            overrides_serialized,
        ]
    )
