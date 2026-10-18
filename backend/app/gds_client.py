"""Thin HTTP client for the Mock GDS. Isolated so tests can replace it."""
import os

import httpx

GDS_URL = os.getenv("GDS_URL", "http://localhost:8001/mock-gds/search")


class GdsError(Exception):
    """The GDS was unreachable or returned something unusable."""


def fetch_gds_trips(source: str, destination: str, journey_date: str) -> list[dict]:
    try:
        resp = httpx.get(
            GDS_URL,
            params={"source": source, "destination": destination, "journey_date": journey_date},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GdsError(f"GDS request failed: {exc}") from exc

    if data.get("status") != "success" or not isinstance(data.get("trips"), list):
        raise GdsError("GDS returned an unexpected response")
    return data["trips"]
