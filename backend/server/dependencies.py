from __future__ import annotations

from fastapi import Request

from backend.server.settings import Settings
from backend.server.stores import AlertStore, PortfolioStore, ResultCache


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_cache(request: Request) -> ResultCache:
    return request.app.state.result_cache


def get_portfolio_store(request: Request) -> PortfolioStore:
    return request.app.state.portfolio_store


def get_alert_store(request: Request) -> AlertStore:
    return request.app.state.alert_store
