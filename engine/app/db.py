"""Hub təklifləri və təsdiq axını (SQLite; istehsalda PostGIS ilə eyni ORM)."""
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

STATUSES = ("Təklif", "Təsdiq gözləyir", "Təsdiqləndi", "Rədd edildi")
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "ayan.db"


class Base(DeclarativeBase):
    pass


class Hub(Base):
    __tablename__ = "hubs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    rank: Mapped[int | None] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(200))
    lon: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    type: Mapped[str] = mapped_column(String(1))
    action: Mapped[str] = mapped_column(String(16))
    docks: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="Təklif")
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(16), default="model")  # model | istifadəçi
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    def as_dict(self):
        return {"id": self.id, "rank": self.rank, "label": self.label, "lon": self.lon, "lat": self.lat,
                "type": self.type, "action": self.action, "docks": self.docks, "status": self.status,
                "note": self.note, "source": self.source, "data": self.data,
                "updated_at": self.updated_at.isoformat()}


engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


SEED_KEYS = ("pop_newly_served", "trips_day", "trips_gross_day", "co2_t_year", "stability")


def init_db(seed_hubs: list[dict]):
    """Model hub-larını toxumla sinxronlaşdırır: yeni/yenilənmiş hub-lar yazılır, toxumda olmayan model
    hub-ları silinir, istifadəçi statusları və qeydləri eyni ID üçün qorunur."""
    Base.metadata.create_all(engine)
    seed_ids = {h["id"] for h in seed_hubs}
    with Session(engine) as s:
        for row in s.query(Hub).filter(Hub.source == "model"):
            if row.id not in seed_ids:
                s.delete(row)
        for h in seed_hubs:
            row = s.get(Hub, h["id"])
            fields = dict(rank=h["rank"], label=h["label"], lon=h["lon"], lat=h["lat"], type=h["type"],
                          action=h["action"], docks=h["docks"], data={k: h[k] for k in SEED_KEYS if k in h})
            if row is None:
                s.add(Hub(id=h["id"], status="Təklif", source="model", **fields))
            else:
                for k, v in fields.items():
                    setattr(row, k, v)
        s.commit()
