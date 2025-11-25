from __future__ import annotations

import time
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from backend.server.dependencies import get_portfolio_store
from backend.server.models import PortfolioRequest
from backend.server.stores import PortfolioItem, PortfolioStore

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("")
def list_portfolio(store: PortfolioStore = Depends(get_portfolio_store)):
    return {"positions": store.list_positions()}


@router.post("")
def create_position(
    payload: PortfolioRequest,
    store: PortfolioStore = Depends(get_portfolio_store),
):
    item = PortfolioItem(
        id=str(uuid4()),
        ticker=payload.ticker,
        quantity=payload.quantity,
        price=payload.price,
        note=payload.note,
        timestamp=time.time(),
    )
    return store.add_position(item)


@router.delete("/{item_id}")
def delete_position(
    item_id: str,
    store: PortfolioStore = Depends(get_portfolio_store),
):
    deleted = store.delete_position(item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Position introuvable")
    return {"status": "deleted"}
