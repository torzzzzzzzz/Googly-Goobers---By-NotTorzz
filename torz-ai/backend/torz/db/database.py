"""Engine/session management and versioned schema migrations."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .models import Base, SchemaMigration

log = logging.getLogger("torz.db")


def _sqlite_pragmas(dbapi_conn, _record) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.close()


# ---------------------------------------------------------------- migrations
# Each migration upgrades an existing database by one version. A brand-new database is created
# directly from the current models and stamped with the latest version.

def _m1_initial(conn) -> None:
    Base.metadata.create_all(conn)


def _m2_indexes(conn) -> None:
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_documents_updated ON documents(updated_at)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_updated ON notes(updated_at)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_attempts_finished ON quiz_attempts(finished_at)"))


MIGRATIONS: list[tuple[int, str, Callable]] = [
    (1, "initial schema", _m1_initial),
    (2, "listing indexes", _m2_indexes),
]
LATEST_VERSION = MIGRATIONS[-1][0]


def run_migrations(engine: Engine) -> int:
    """Bring the database up to LATEST_VERSION. Returns the resulting version."""
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    with engine.begin() as conn:
        if "schema_migrations" not in existing:
            if existing - {"schema_migrations"}:
                # Tables without a migration record: treat as version 1 (initial) and continue.
                SchemaMigration.__table__.create(conn, checkfirst=True)
                conn.execute(
                    SchemaMigration.__table__.insert().values(version=1, name="adopted existing schema")
                )
            else:
                Base.metadata.create_all(conn)
                for version, name, fn in MIGRATIONS:
                    if version > 1:
                        fn(conn)
                    conn.execute(SchemaMigration.__table__.insert().values(version=version, name=name))
                log.info("Created new database at schema version %s", LATEST_VERSION)
                return LATEST_VERSION
        applied = {row[0] for row in conn.execute(text("SELECT version FROM schema_migrations"))}
        for version, name, fn in MIGRATIONS:
            if version not in applied:
                log.info("Applying migration %s: %s", version, name)
                fn(conn)
                conn.execute(SchemaMigration.__table__.insert().values(version=version, name=name))
        return max(applied | {v for v, _, _ in MIGRATIONS})


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.engine = create_engine(
            f"sqlite:///{path}",
            connect_args={"check_same_thread": False, "timeout": 15},
            pool_pre_ping=True,
        )
        event.listen(self.engine, "connect", _sqlite_pragmas)
        self.SessionLocal = sessionmaker(bind=self.engine, expire_on_commit=False, autoflush=False)
        self.version = run_migrations(self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        s = self.SessionLocal()
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def integrity_check(self) -> str:
        with self.engine.connect() as conn:
            return str(conn.execute(text("PRAGMA integrity_check")).scalar())

    def dispose(self) -> None:
        self.engine.dispose()
