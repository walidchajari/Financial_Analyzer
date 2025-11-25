from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, field_validator

from backend.app import DEFAULT_TERMINAL_GROWTH, DEFAULT_WACC


class AnalysisRequest(BaseModel):
    ticker: str = Field(..., description="Ticker Yahoo Finance (ex: AAPL)")
    wacc: float = Field(DEFAULT_WACC, description="WACC (décimal, 0.08 = 8 %)")
    terminalGrowth: float = Field(DEFAULT_TERMINAL_GROWTH, description="Croissance terminale (décimal)")
    sector: Optional[str] = Field(None, description="Secteur forcé")
    overrides: Optional[Dict[str, float]] = Field(None, description="Valeurs manuelles (prix, EPS, etc.)")

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        cleaned = (value or "").strip().upper()
        if not cleaned:
            raise ValueError("Ticker requis")
        return cleaned


class PortfolioRequest(BaseModel):
    ticker: str
    quantity: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    note: Optional[str] = None

    @field_validator("ticker")
    @classmethod
    def normalize_portfolio_ticker(cls, value: str) -> str:
        cleaned = (value or "").strip().upper()
        if not cleaned:
            raise ValueError("Ticker requis")
        return cleaned


class AlertRequest(BaseModel):
    ticker: str
    metric: str
    operator: str = Field(..., description=">, <, >= ou <=")
    threshold: float
    note: Optional[str] = None

    @field_validator("ticker")
    @classmethod
    def normalize_alert_ticker(cls, value: str) -> str:
        cleaned = (value or "").strip().upper()
        if not cleaned:
            raise ValueError("Ticker requis")
        return cleaned

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        allowed = {">", "<", ">=", "<="}
        if value not in allowed:
            raise ValueError("Opérateur invalide")
        return value
