from pathlib import Path

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


Base = declarative_base()


class SmartClipboardRecord(Base):
    __tablename__ = "smart_clipboard_records"

    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)
    content_type = Column(String(32), default="text", index=True)
    content_hash = Column(String(64), index=True)
    char_count = Column(Integer, default=0)
    language = Column(String(64), nullable=True)
    domain = Column(String(255), nullable=True)
    is_code = Column(Boolean, default=False)
    timestamp = Column(DateTime, index=True)


class SmartWindowRecord(Base):
    __tablename__ = "smart_window_records"

    id = Column(Integer, primary_key=True)
    window_title = Column(Text, default="")
    process_name = Column(String(255), default="unknown", index=True)
    duration_seconds = Column(Float, default=0.0)
    timestamp = Column(DateTime, index=True)


class WindowSwitchEvent(Base):
    __tablename__ = "window_switch_events"

    id = Column(Integer, primary_key=True)
    to_window = Column(Text, default="")
    to_process = Column(String(255), default="unknown", index=True)
    category = Column(String(64), default="other", index=True)
    project = Column(String(255), nullable=True, index=True)
    language = Column(String(64), nullable=True)
    domain = Column(String(255), nullable=True)
    timestamp = Column(DateTime, index=True)


class InputStats(Base):
    __tablename__ = "input_stats"

    id = Column(Integer, primary_key=True)
    source = Column(String(64), default="unknown", index=True)
    count = Column(Integer, default=0)
    timestamp = Column(DateTime, index=True)


def init_db(db_path):
    path = Path(db_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        f"sqlite:///{path.as_posix()}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    return engine, Session
