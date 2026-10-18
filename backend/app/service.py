"""Pure business logic: validation, matching, filtering, response shaping.

No HTTP in here, so it is easy to unit-test.
"""
from datetime import datetime


class ValidationError(Exception):
    """Raised when the user's search parameters are invalid."""


def _norm(text: str) -> str:
    """Normalise a city name for comparison: trim + lowercase."""
    return " ".join(text.strip().lower().split())


def validate_params(source, destination, journey_date) -> tuple[str, str, str]:
    """Return cleaned (source, destination, journey_date) or raise ValidationError."""
    if not source or not source.strip():
        raise ValidationError("source is required")
    if not destination or not destination.strip():
        raise ValidationError("destination is required")
    if not journey_date or not journey_date.strip():
        raise ValidationError("journey_date is required")

    if _norm(source) == _norm(destination):
        raise ValidationError("source and destination cannot be the same")

    try:
        datetime.strptime(journey_date.strip(), "%Y-%m-%d")
    except ValueError:
        raise ValidationError("journey_date must be in YYYY-MM-DD format")
    # A past-date check is intentionally skipped: the supplied data is fixed
    # at 2026-08-09 and we don't want it to break as the real date moves on.

    return source.strip(), destination.strip(), journey_date.strip()


def _time_to_minutes(value: str) -> int:
    """'4:00 PM' -> 960, '01:30 PM' -> 810. Used for 'earliest departure' sort."""
    t = datetime.strptime(value.strip(), "%I:%M %p")
    return t.hour * 60 + t.minute


def _duration_text(minutes: int) -> str:
    return f"{minutes // 60}h {minutes % 60}m"


def _is_bookable(trip: dict) -> bool:
    avail = trip.get("availability") or {}
    return bool(avail.get("is_available")) and (avail.get("seats_available") or 0) > 0


def _matches(trip: dict, source: str, destination: str, journey_date: str) -> bool:
    # NOTE: we use the structured from/to city fields, NOT route_name,
    # because route_name is unreliable in the supplied data.
    return (
        _norm(trip.get("from_city_name", "")) == _norm(source)
        and _norm(trip.get("to_city_name", "")) == _norm(destination)
        and (trip.get("schedule") or {}).get("departure_date") == journey_date
    )


def _shape_stop(stop: dict) -> dict:
    return {
        "name": stop.get("name"),
        "time": stop.get("time"),
        "contact": stop.get("contact"),
        "is_nearest": bool(stop.get("is_nearest")),
    }


def to_rightbus_bus(trip: dict) -> dict:
    """Convert a raw GDS trip into the clean RightBus bus object."""
    sched = trip["schedule"]
    return {
        "trip_id": trip["trip_id"],
        "operator": trip["operator"],
        "bus_type": trip["bus_type"],
        # is_ac / bus_seat_type are the structured fields; bus_type text can
        # contradict them (e.g. "NON AC Seater" with is_ac=true, Sleeper).
        "is_ac": bool(trip["is_ac"]),
        "seat_type": trip.get("bus_seat_type") or "Unknown",
        "amenities": trip.get("amenities", []),
        "departure_time": sched["departure_time"],
        "arrival_time": sched["arrival_time"],
        "departure_date": sched["departure_date"],
        "arrival_date": sched.get("estimated_arrival_date"),
        "departure_minutes": _time_to_minutes(sched["departure_time"]),
        "duration_minutes": sched["duration_minutes"],
        "duration_text": _duration_text(sched["duration_minutes"]),
        "fare": trip["pricing"]["total_fare"],
        "currency": trip["pricing"].get("currency", "INR"),
        "seats_available": trip["availability"]["seats_available"],
        "boarding_points": [_shape_stop(s) for s in trip.get("boarding_points", [])],
        "dropping_points": [_shape_stop(s) for s in trip.get("dropping_points", [])],
        "cancellation_policy": trip.get("cancellation_policy"),
    }


def process_trips(raw_trips: list[dict], source: str, destination: str, journey_date: str) -> list[dict]:
    """Filter by route + date, drop unavailable trips, and reshape."""
    buses = []
    for trip in raw_trips:
        if _matches(trip, source, destination, journey_date) and _is_bookable(trip):
            buses.append(to_rightbus_bus(trip))
    return buses
