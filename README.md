# RightBus – Full-Stack Bus Search

A small bus-search module. A user enters a source, destination and journey date, clicks **Search**, and sees the buses that match the route.

```
Frontend  ──►  RightBus Backend (:8000)  ──►  Mock GDS API (:8001)  ──►  hardcoded JSON
```

The browser only talks to the RightBus backend. It never calls the Mock GDS directly. The backend calls the Mock GDS, then validates, filters and reshapes the response.

## Technologies

| Layer | Technology |
|---|---|
| Mock GDS API | Python, FastAPI, Uvicorn |
| RightBus backend | Python, FastAPI, Uvicorn, httpx (HTTP client) |
| Frontend | Plain HTML, CSS and JavaScript (no build step) |
| Data | Supplied hardcoded JSON file (no database is used) |
| Tests | pytest + FastAPI TestClient; manual API checks in Postman |

## Project layout

```
rightbus/
├── mock_gds/
│   ├── main.py                  Mock GDS API (port 8001)
│   ├── requirements.txt
│   └── data/gds_response.json   Supplied Appendix A JSON
├── backend/
│   ├── app/
│   │   ├── main.py              GET /api/buses/search, also serves the frontend
│   │   ├── service.py           validation, matching, filtering, response shaping
│   │   └── gds_client.py        HTTP call to the Mock GDS
│   ├── tests/test_search.py     13 backend tests
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── index.html, home.js      search (landing) page
│   ├── results.html, app.js     results page: states, filters, sorting, details
│   ├── style.css
│   └── images/
├── .gitignore
└── README.md
```

## Setup and how to run

Requires Python 3.10 or newer. Commands below are for Windows PowerShell; run them from the project root (`rightbus/`).

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r mock_gds\requirements.txt
pip install -r backend\requirements.txt
```

Open **two terminals** (activate the virtual environment in each).

```powershell
# Terminal 1 – Mock GDS  (http://localhost:8001)
cd mock_gds
uvicorn main:app --port 8001

# Terminal 2 – Backend + frontend  (http://localhost:8000)
cd backend
uvicorn app.main:app --port 8000
```

Open **http://localhost:8000** and search **Bangalore → Mumbai** on **2026-08-09**.

- The backend serves the frontend files, so there is nothing separate to start for the frontend.
- The backend finds the Mock GDS through the environment variable `GDS_URL` (default `http://localhost:8001/mock-gds/search`).
- `http://localhost:8001` on its own shows `{"detail":"Not Found"}`. That is expected, because the mock only has the `/mock-gds/search` route.
- If you see "only one usage of each socket address is permitted", the port is already in use. Stop the old server, or check with `netstat -ano | findstr :8000`.

## API endpoints

### Mock GDS: `GET /mock-gds/search?source=&destination=&journey_date=`
Ignores the parameters and returns the supplied JSON unchanged, like an external provider whose inventory the backend must process.

```
http://localhost:8001/mock-gds/search?source=Bangalore&destination=Mumbai&journey_date=2026-08-09
```

### RightBus backend: `GET /api/buses/search?source=&destination=&journey_date=`

```
http://localhost:8000/api/buses/search?source=Bangalore&destination=Mumbai&journey_date=2026-08-09
```

| Status | When | Body |
|---|---|---|
| 200 | Search succeeded (`count: 0` means no matching buses) | `{status, search, count, buses[]}` |
| 400 | Missing or invalid parameter, or source equals destination | `{status: "error", message}` |
| 502 | The Mock GDS is down or returned an unusable response | `{status: "error", message}` |

Each bus contains: `trip_id, operator, bus_type, is_ac, seat_type, amenities, departure_time, arrival_time, departure_date, arrival_date, duration_minutes, duration_text, fare, currency, seats_available, boarding_points, dropping_points, cancellation_policy`. Booking tokens and other raw GDS internals are not exposed.

## How the Mock GDS works

`mock_gds/main.py` reads `mock_gds/data/gds_response.json` on every request and returns it as is, whatever the search parameters are. All real filtering is the RightBus backend's job. The JSON can be edited without restarting the mock.

## How filtering works (backend)

1. **Validate**: `source`, `destination` and `journey_date` are required; the date must be `YYYY-MM-DD`; source and destination must differ (compared trimmed and case-insensitive).
2. **Call the Mock GDS** with `httpx` (5 second timeout) and read `trips`.
3. **Match** each trip on `from_city_name == source`, `to_city_name == destination` (trimmed, case-insensitive) and `schedule.departure_date == journey_date`.
   `route_name` is **never used**: the supplied data has inconsistent values (for example, Bangalore → Mumbai trips whose `route_name` says "Jaisalmer" or "Jodhpur").
4. **Exclude unavailable trips**: `availability.is_available` is false, or `seats_available <= 0`.
5. **Reshape** the remaining trips into the clean RightBus response.

Data quirk handled: trip `TRP-128475` has the text "NON AC Seater" in `bus_type`, but `is_ac` is `true` and `bus_seat_type` is `Sleeper`. The structured fields (`is_ac`, `bus_seat_type`) are used for the filters; the `bus_type` text is displayed as given.

## Frontend

- **Search page** (`index.html`): From, To, Journey date and a Search button, with inline validation.
- **Results page** (`results.html`): calls the backend and shows one card per bus: operator, bus type, departure and arrival, duration, AC / Non-AC, seat type, seats available and fare.
- **UI states**: loading, results, no results (also when filters match nothing) and API error with a "Try again" button.
- **Filters and sorting** (applied in the browser to the fetched list): AC / Non-AC, Sleeper / Seater, price low to high, earliest departure.
- **View details**: boarding points, dropping points (with times, contact numbers and Google Maps directions links), amenities and cancellation policy.
- **Select this bus**: opens a "Your selection" panel to pick a boarding and a dropping point and see a trip summary. Real booking and payment are outside this assignment.

## Testing

### Automated backend tests

```powershell
cd backend
pytest -v
```

If you see `No module named 'app'`, use `python -m pytest -v` (the included `pytest.ini` normally prevents this).

13 tests. The Mock GDS call is replaced by the supplied JSON, so no server needs to be running. They cover: Bangalore → Mumbai, Bangalore → Delhi, missing source, missing destination, same source and destination, wrong date, invalid date format, case-insensitive city match, reverse route, unavailable trips are excluded, clean response fields, GDS failure (502), and any city pair working when data exists.

### Manual API tests (Postman)

Start both servers, then send these `GET` requests:

| # | URL | Expected |
|---|---|---|
| 1 | `http://127.0.0.1:8001/mock-gds/search?source=Bangalore&destination=Mumbai&journey_date=2026-08-09` | 200, raw JSON with 5 trips |
| 2 | `http://127.0.0.1:8000/api/buses/search?source=Bangalore&destination=Mumbai&journey_date=2026-08-09` | 200, `count: 5` |
| 3 | `http://127.0.0.1:8000/api/buses/search?source=Bangalore&destination=Delhi&journey_date=2026-08-09` | 200, `count: 0` |
| 4 | `http://127.0.0.1:8000/api/buses/search?destination=Mumbai&journey_date=2026-08-09` | 400, source is required |
| 5 | `http://127.0.0.1:8000/api/buses/search?source=Bangalore&journey_date=2026-08-09` | 400, destination is required |
| 6 | `http://127.0.0.1:8000/api/buses/search?source=Bangalore&destination=Bangalore&journey_date=2026-08-09` | 400, source and destination cannot be the same |
| 7 | `http://127.0.0.1:8000/api/buses/search?source=Bangalore&destination=Mumbai&journey_date=09-08-2026` | 400, journey_date must be in YYYY-MM-DD format |

Stop the Mock GDS and repeat request 2 to see the 502 error.

### Frontend scenarios (manual)

1. **Happy path with filters and details**: search Bangalore → Mumbai on 2026-08-09 → 5 buses. Choose AC → 2 buses. Sort by price → cheapest first. Click View details → boarding and dropping points show. Click Select this bus → the "Your selection" panel appears.
2. **No results**: search Bangalore → Delhi → "No buses found".
3. **Validation**: clear Source and search → inline error, no request is sent.
4. **API error**: stop the Mock GDS and search → "Couldn't load buses" with Try again. Stop the backend instead → "Can't reach the server".

## Assumptions and notes

- **Only 2026-08-09 returns buses.** Every supplied trip departs on that date and the backend matches the date exactly, so other dates correctly return no results.
- **Only Bangalore → Mumbai exists in the supplied data.** Other routes return no results. The route matching itself works for any city pair if the data contains it.
- **No database.** The assignment supplies hardcoded JSON as the data source, so the Mock GDS reads it from a file.
- **Optional demo data (off by default):** start the Mock GDS with `INCLUDE_DEMO_TRIPS=1` to add reversed copies (Mumbai → Bangalore) of the supplied trips, with ids starting `DEMO-`.
  PowerShell: `$env:INCLUDE_DEMO_TRIPS="1"; uvicorn main:app --port 8001`
- No secrets or API keys are used or stored in this repository.

## Evaluation mapping

| Area | Weight | Where |
|---|---|---|
| Backend API + processing | 25% | `backend/app/main.py`, `service.py` |
| Mock GDS API | 10% | `mock_gds/main.py`, `mock_gds/data/gds_response.json` |
| Correct route/date filtering | 20% | `_matches` in `service.py` (never uses `route_name`) |
| Frontend + UI states | 20% | `frontend/` (`index.html`, `results.html`, `app.js`) |
| Integration | 10% | Frontend → backend → Mock GDS, `gds_client.py` |
| Testing | 10% | `backend/tests/test_search.py` (13 tests), Postman requests, frontend scenarios |
| Code quality / README | 5% | Separated modules, comments, this file |

