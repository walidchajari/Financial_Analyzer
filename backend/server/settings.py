from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(slots=True)
class Settings:
    """Application-level configuration, sourced from the environment."""

    app_name: str = os.getenv("ANALYZER_APP_NAME", "Financial Analyzer API")
    cache_ttl: int = int(os.getenv("ANALYZER_CACHE_TTL", "600"))
    cors_allow_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("ANALYZER_ALLOW_ORIGINS", "").split(",")
        if origin.strip()
    )
    data_dir: Path = Path(os.getenv("ANALYZER_DATA_DIR", "./storage")).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
