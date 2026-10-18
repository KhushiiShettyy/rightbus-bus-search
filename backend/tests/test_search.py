import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import gds_client, main

DATA = json.loads(
    (Path(__file__).resolve().parents[2] / "mock_gds" / "data" / "gds_response.json").read_text()
)
client = TestClient(main.app)
URL = "/api/buses/search"
DATE = "2026-08-09"


@pytest.fixture(autouse=True)
def fake_gds(monkeypatch):
    """Replace the real HTTP call with the hardcoded JSON (no servers needed)."""
    monkeypatch.setattr(gds_client, "fetch_gds_trips", lambda *a: copy.deepcopy(DATA["trips"]))


def search(**params):
    return client.get(URL, params=params)


def test_bangalore_to_mumbai_returns_all_five_trips():
    r = search(source="Bangalore", destination="Mumbai", journey_date=DATE)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 5
    # trips with a misleading route_name (Jaisalmer / Jodhpur) must still be included
    ids = {b["trip_id"] for b in body["buses"]}
    assert {"TRP-120807", "TRP-128852", "TRP-130024"} <= ids


def test_bangalore_to_delhi_returns_no_results():
    r = search(source="Bangalore", destination="Delhi", journey_date=DATE)
    assert r.status_code == 200
    assert r.json()["count"] == 0 and r.json()["buses"] == []


def test_missing_source_is_400():
    r = search(destination="Mumbai", journey_date=DATE)
    assert r.status_code == 400 and "source" in r.json()["message"]


def test_missing_destination_is_400():
    r = search(source="Bangalore", journey_date=DATE)
    assert r.status_code == 400 and "destination" in r.json()["message"]


def test_same_source_and_destination_is_400():
    r = search(source="Mumbai", destination=" mumbai ", journey_date=DATE)
    assert r.status_code == 400 and "same" in r.json()["message"]


def test_wrong_date_returns_no_results():
    r = search(source="Bangalore", destination="Mumbai", journey_date="2026-08-10")
    assert r.json()["count"] == 0


def test_invalid_date_format_is_400():
    r = search(source="Bangalore", destination="Mumbai", journey_date="09-08-2026")
    assert r.status_code == 400


def test_city_match_is_case_insensitive():
    r = search(source="bAnGaLoRe", destination="MUMBAI", journey_date=DATE)
    assert r.json()["count"] == 5


def test_reverse_route_does_not_match():
    r = search(source="Mumbai", destination="Bangalore", journey_date=DATE)
    assert r.json()["count"] == 0


def test_unavailable_trips_are_excluded(monkeypatch):
    trips = copy.deepcopy(DATA["trips"])
    trips[0]["availability"]["is_available"] = False
    trips[1]["availability"]["seats_available"] = 0
    monkeypatch.setattr(gds_client, "fetch_gds_trips", lambda *a: trips)
    r = search(source="Bangalore", destination="Mumbai", journey_date=DATE)
    assert r.json()["count"] == 3


def test_response_has_clean_fields():
    bus = search(source="Bangalore", destination="Mumbai", journey_date=DATE).json()["buses"][0]
    for key in ["trip_id", "operator", "bus_type", "departure_time", "arrival_time",
                "duration_text", "fare", "seats_available", "is_ac", "seat_type",
                "boarding_points", "dropping_points"]:
        assert key in bus
    assert "booking_token" not in bus  # internal GDS data is not leaked


def test_gds_failure_returns_502(monkeypatch):
    def boom(*a):
        raise gds_client.GdsError("down")
    monkeypatch.setattr(gds_client, "fetch_gds_trips", boom)
    r = search(source="Bangalore", destination="Mumbai", journey_date=DATE)
    assert r.status_code == 502


def test_any_city_pair_works_when_data_exists(monkeypatch):
    """Nothing is hardcoded to Bangalore/Mumbai: add a trip and it is found."""
    trips = copy.deepcopy(DATA["trips"])
    extra = copy.deepcopy(trips[0])
    extra.update(trip_id="TRP-X1", from_city_name="Delhi", to_city_name="Jaipur")
    trips.append(extra)
    monkeypatch.setattr(gds_client, "fetch_gds_trips", lambda *a: trips)
    r = search(source="delhi", destination="Jaipur", journey_date=DATE)
    assert r.json()["count"] == 1 and r.json()["buses"][0]["trip_id"] == "TRP-X1"
