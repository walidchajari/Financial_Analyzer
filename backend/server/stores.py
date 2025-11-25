from __future__ import annotations

import time
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass(slots=True)
class CacheEntry:
    payload: Dict[str, Any]
    timestamp: float


class ResultCache:
    def __init__(self, ttl: int) -> None:
        self.ttl = ttl
        self._entries: Dict[str, CacheEntry] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        if self.ttl <= 0:
            return None
        entry = self._entries.get(key)
        if not entry:
            return None
        if time.time() - entry.timestamp > self.ttl:
            self._entries.pop(key, None)
            return None
        return entry.payload

    def store(self, key: str, payload: Dict[str, Any]) -> None:
        if self.ttl <= 0:
            return
        self._entries[key] = CacheEntry(payload=payload, timestamp=time.time())

    def clear(self) -> None:
        self._entries.clear()


@dataclass(slots=True)
class PortfolioItem:
    id: str
    ticker: str
    quantity: float
    price: float
    note: Optional[str]
    timestamp: float

    @property
    def value(self) -> float:
        return self.quantity * self.price


class PortfolioStore:
    def __init__(self, storage_path: Optional[Path] = None) -> None:
        self._items: Dict[str, PortfolioItem] = {}
        self._storage_path = storage_path
        if self._storage_path:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
            self._load_from_disk()

    def list_positions(self) -> List[Dict[str, Any]]:
        return [self._serialize(item) for item in self._items.values()]

    def add_position(self, item: PortfolioItem) -> Dict[str, Any]:
        self._items[item.id] = item
        payload = self._serialize(item)
        self._persist()
        return payload

    def delete_position(self, item_id: str) -> bool:
        deleted = self._items.pop(item_id, None) is not None
        if deleted:
            self._persist()
        return deleted

    @staticmethod
    def _serialize(item: PortfolioItem) -> Dict[str, Any]:
        return {
            "id": item.id,
            "ticker": item.ticker,
            "quantity": item.quantity,
            "price": item.price,
            "value": item.value,
            "note": item.note,
            "timestamp": item.timestamp,
        }

    def _load_from_disk(self) -> None:
        if not self._storage_path or not self._storage_path.exists():
            return
        try:
            data = json.loads(self._storage_path.read_text(encoding="utf-8") or "[]")
        except (json.JSONDecodeError, OSError):
            return
        for entry in data:
            try:
                item = PortfolioItem(
                    id=entry["id"],
                    ticker=entry["ticker"],
                    quantity=float(entry["quantity"]),
                    price=float(entry["price"]),
                    note=entry.get("note"),
                    timestamp=float(entry["timestamp"]),
                )
            except (KeyError, TypeError, ValueError):
                continue
            self._items[item.id] = item

    def _persist(self) -> None:
        if not self._storage_path:
            return
        payload = [self._serialize(item) for item in self._items.values()]
        tmp_path = self._storage_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp_path.replace(self._storage_path)


@dataclass(slots=True)
class AlertItem:
    id: str
    ticker: str
    metric: str
    operator: str
    threshold: float
    note: Optional[str]
    timestamp: float


class AlertStore:
    def __init__(self, storage_path: Optional[Path] = None) -> None:
        self._alerts: Dict[str, AlertItem] = {}
        self._storage_path = storage_path
        if self._storage_path:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
            self._load_from_disk()

    def list_alerts(self) -> List[Dict[str, Any]]:
        return [self._serialize(alert) for alert in self._alerts.values()]

    def add_alert(self, alert: AlertItem) -> Dict[str, Any]:
        self._alerts[alert.id] = alert
        payload = self._serialize(alert)
        self._persist()
        return payload

    def delete_alert(self, alert_id: str) -> bool:
        deleted = self._alerts.pop(alert_id, None) is not None
        if deleted:
            self._persist()
        return deleted

    @staticmethod
    def _serialize(alert: AlertItem) -> Dict[str, Any]:
        return {
            "id": alert.id,
            "ticker": alert.ticker,
            "metric": alert.metric,
            "operator": alert.operator,
            "threshold": alert.threshold,
            "note": alert.note,
            "timestamp": alert.timestamp,
        }

    def _load_from_disk(self) -> None:
        if not self._storage_path or not self._storage_path.exists():
            return
        try:
            data = json.loads(self._storage_path.read_text(encoding="utf-8") or "[]")
        except (json.JSONDecodeError, OSError):
            return
        for entry in data:
            try:
                alert = AlertItem(
                    id=entry["id"],
                    ticker=entry["ticker"],
                    metric=entry["metric"],
                    operator=entry["operator"],
                    threshold=float(entry["threshold"]),
                    note=entry.get("note"),
                    timestamp=float(entry["timestamp"]),
                )
            except (KeyError, TypeError, ValueError):
                continue
            self._alerts[alert.id] = alert

    def _persist(self) -> None:
        if not self._storage_path:
            return
        payload = [self._serialize(alert) for alert in self._alerts.values()]
        tmp_path = self._storage_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp_path.replace(self._storage_path)
