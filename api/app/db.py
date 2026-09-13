from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_dir(url: str) -> None:
    if not url.startswith("sqlite"):
        return
    raw = url.split("///", 1)[-1]
    path = Path(raw)
    if path.parent and str(path.parent) not in {".", ""}:
        path.parent.mkdir(parents=True, exist_ok=True)


settings = get_settings()
_ensure_sqlite_dir(settings.database_url)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def migrate_db():
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.connect() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(businesses)").fetchall()}
        new_cols = [
            ("location", "VARCHAR(255) DEFAULT ''"),
            ("presence_type", "VARCHAR(40) DEFAULT 'brick_and_mortar'"),
            ("social_links_json", "TEXT DEFAULT '{}'"),
            ("generate_state_json", "TEXT DEFAULT ''"),
            # Businesses that existed before the products/services fork are shops as far
            # as anyone knows, so they keep the old behaviour rather than being re-asked.
            ("business_model", "VARCHAR(20) DEFAULT 'products'"),
        ]
        for col, col_type in new_cols:
            if col not in existing:
                conn.exec_driver_sql(f"ALTER TABLE businesses ADD COLUMN {col} {col_type}")
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
