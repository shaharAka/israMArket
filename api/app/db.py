from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
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


# How long a writer waits for another one to finish before SQLite says "database is
# locked". The default (5 s) was shorter than one image job's old transaction (#123).
SQLITE_BUSY_TIMEOUT_MS = 30_000


def sqlite_pragmas(engine: Engine) -> Engine:
    """WAL (readers never block the writer, nor it them) and a busy timeout, on every
    connection of a SQLite engine. A no-op for any other database.

    WAL is stored in the database file, so this only switches it on the first time; the
    nightly `.backup` (deploy/gcp/backup.sh) copies a WAL database consistently."""
    if engine.dialect.name != "sqlite":
        return engine

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS}")
            database = engine.url.database or ""
            if database and database != ":memory:" and not database.startswith("file::memory:"):
                cursor.execute("PRAGMA journal_mode = WAL")
        finally:
            cursor.close()

    return engine


settings = get_settings()
_ensure_sqlite_dir(settings.database_url)

engine = sqlite_pragmas(
    create_engine(
        settings.database_url,
        connect_args=(
            {"check_same_thread": False, "timeout": SQLITE_BUSY_TIMEOUT_MS / 1000}
            if settings.database_url.startswith("sqlite")
            else {}
        ),
    )
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
            # Design DNA (services/design_dna.py). Empty on existing rows: built on the
            # first read of /brand/dna or the next site scan.
            ("brand_dna_json", "TEXT DEFAULT ''"),
            # The same-origin logo copy (services/brand_logo.py). Empty until fetched.
            ("brand_logo_json", "TEXT DEFAULT ''"),
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
