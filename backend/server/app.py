from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.server.routes import alerts, analysis, portfolio
from backend.server.settings import Settings, get_settings
from backend.server.stores import AlertStore, PortfolioStore, ResultCache


def configure_cors(app: FastAPI, settings: Settings) -> None:
    if not settings.cors_allow_origins:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_allow_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings
    app.state.result_cache = ResultCache(ttl=settings.cache_ttl)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    portfolio_path = settings.data_dir / "portfolio.json"
    alerts_path = settings.data_dir / "alerts.json"
    app.state.portfolio_store = PortfolioStore(portfolio_path)
    app.state.alert_store = AlertStore(alerts_path)
    yield
    # No teardown logic for now; stores live with the app instance.


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title=settings.app_name, lifespan=lifespan)
    configure_cors(application, settings)
    application.include_router(analysis.router)
    application.include_router(portfolio.router)
    application.include_router(alerts.router)
    return application


app = create_app()
