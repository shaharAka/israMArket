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
            # Competitor / peer Instagram usernames for the inspiration brief.
            ("instagram_handles_json", "TEXT DEFAULT '[]'"),
            # The WhatsApp tracked link (services/whatsapp.py).
            ("whatsapp_number_e164", "VARCHAR(20)"),
            ("whatsapp_default_text_he", "TEXT DEFAULT ''"),
        ]
        for col, col_type in new_cols:
            if col not in existing:
                conn.exec_driver_sql(f"ALTER TABLE businesses ADD COLUMN {col} {col_type}")
        # The free first month (Revision 7 B): additive, NULL/empty on existing accounts.
        user_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
        for col, col_type in (
            ("trial_started_at", "DATETIME"),
            ("welcomed_at", "DATETIME"),
            ("trial_events_json", "TEXT DEFAULT '{}'"),
            # Sign in with Google (routers/auth.py). SQLite cannot add a UNIQUE column, so
            # the uniqueness is the index below, the same one create_all makes.
            ("google_sub", "VARCHAR(255)"),
            ("session_epoch", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if col not in user_cols:
                conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {col} {col_type}")
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)"
        )
        # Billing (models.Subscription, models.Payment) arrived as whole new tables, which
        # `Base.metadata.create_all` creates on boot with their unique indexes; there is
        # nothing to ALTER for them. A column added to either later goes in a block here,
        # like the ones above.
        # The business field list became industries only (keys, not Hebrew labels).
        # Rewrites old labels once; a row that already holds a key is left alone.
        from app.services.business_fields import migrate_business_types

        migrate_business_types(conn)
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
