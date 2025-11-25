from __future__ import annotations

import time
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from backend.server.dependencies import get_alert_store
from backend.server.models import AlertRequest
from backend.server.stores import AlertItem, AlertStore

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(store: AlertStore = Depends(get_alert_store)):
    return {"alerts": store.list_alerts()}


@router.post("")
def create_alert(payload: AlertRequest, store: AlertStore = Depends(get_alert_store)):
    alert = AlertItem(
        id=str(uuid4()),
        ticker=payload.ticker,
        metric=payload.metric,
        operator=payload.operator,
        threshold=payload.threshold,
        note=payload.note,
        timestamp=time.time(),
    )
    return store.add_alert(alert)


@router.delete("/{alert_id}")
def delete_alert(alert_id: str, store: AlertStore = Depends(get_alert_store)):
    deleted = store.delete_alert(alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    return {"status": "deleted"}
