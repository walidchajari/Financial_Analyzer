from __future__ import annotations

import asyncio
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from backend.app import run_analysis_pipeline
from backend.server.dependencies import get_cache
from backend.server.models import AnalysisRequest
from backend.server.stores import ResultCache
from backend.server.utils import cache_key

router = APIRouter(tags=["analysis"])


@router.post("/analyze")
async def analyze_company(
    request_payload: AnalysisRequest,
    cache: ResultCache = Depends(get_cache),
) -> Dict[str, Any]:
    key = cache_key(request_payload)
    cached = cache.get(key)
    if cached:
        return cached
    try:
        result, _context = await asyncio.get_running_loop().run_in_executor(
            None,
            run_analysis_pipeline,
            request_payload.ticker,
            request_payload.wacc,
            request_payload.terminalGrowth,
            request_payload.sector,
            False,
            request_payload.overrides,
        )
    except Exception as exc:  # pragma: no cover - FastAPI surface
        raise HTTPException(status_code=500, detail=f"Analyse impossible : {exc}") from exc
    cache.store(key, result)
    return result
