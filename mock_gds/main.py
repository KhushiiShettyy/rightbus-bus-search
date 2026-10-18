"""Mock GDS (Global Distribution System) API.

Pretends to be an external bus-inventory provider. It ignores the search
parameters on purpose and always returns the same hardcoded JSON, just like
the assignment asks. All real filtering is the RightBus backend's job.

OPTIONAL demo switch: set INCLUDE_DEMO_TRIPS=1 to also return reversed copies
(Mumbai -> Bangalore) of the supplied trips, clearly marked with a DEMO- id.
It is OFF by default so the supplied data stays untouched.
"""
import copy
import json
import os
from pathlib import Path

from fastapi import FastAPI

DATA_FILE = Path(__file__).parent / "data" / "gds_response.json"

app = FastAPI(title="Mock GDS API")


def _reversed_demo_trips(trips: list[dict]) -> list[dict]:
    out = []
    for t in trips:
        r = copy.deepcopy(t)
        r["trip_id"] = "DEMO-" + t["trip_id"].split("-", 1)[-1]
        r["from_city_name"], r["to_city_name"] = t["to_city_name"], t["from_city_name"]
        r["route_name"] = f'{r["from_city_name"]} To {r["to_city_name"]} (demo)'
        r["boarding_points"], r["dropping_points"] = t["dropping_points"], t["boarding_points"]
        out.append(r)
    return out


@app.get("/mock-gds/search")
def search(source: str = "", destination: str = "", journey_date: str = ""):
    # Read per request so you can edit the JSON without restarting.
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if os.getenv("INCLUDE_DEMO_TRIPS") == "1":
        data["trips"] = data["trips"] + _reversed_demo_trips(data["trips"])
    return data
