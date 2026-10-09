"""Refresh a saved post array under SQLite's write lock before changing it."""
from sqlalchemy import update
from app.models import Strategy


def lock_and_refresh(db, strategy):
    db.execute(update(Strategy).where(Strategy.id == strategy.id).values(id=Strategy.id))
    db.refresh(strategy)
