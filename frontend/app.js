// RightBus results page. Talks ONLY to the RightBus backend (/api/buses/search).
const API_BASE = ""; // same origin; change if the frontend is hosted separately

const $ = (id) => document.getElementById(id);
const form = $("search-form"), stateEl = $("state"), resultsEl = $("results");
const controlsEl = $("controls"), summaryEl = $("summary"), formError = $("form-error");

let lastSearch = { source: "", destination: "" };
let allBuses = [];                       // last successful result (unfiltered)
const filters = { ac: "", seat: "", sort: "" };

// ---------- helpers ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  children.forEach((c) => node.append(c));
  return node; // textContent/append only -> API data can't inject HTML
}
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

const CITY_INFO = {
  mumbai: "Gateway of India, Marine Drive sunsets and the city that never sleeps.",
  bangalore: "The Garden City: parks, cafés and India's tech capital.",
  bengaluru: "The Garden City: parks, cafés and India's tech capital.",
};
function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function setHeader(source, destination, date, count) {
  $("route-title").textContent = `${source} → ${destination}`;
  const blurb = CITY_INFO[destination.toLowerCase()];
  const parts = [prettyDate(date)];
  if (count !== undefined) parts.push(`${count} bus${count === 1 ? "" : "es"} found`);
  $("route-sub").textContent = parts.join(" · ") + (blurb ? ` — ${blurb}` : "");
}

// ---------- chips (only offer choices that exist) ----------
function chipRow(container, options, current, onPick) {
  container.replaceChildren(...options.map((o) => {
    const b = el("button", { type: "button", className: "chip" + (o.value === current ? " on" : "") });
    b.append(o.label);
    if (o.count !== undefined) b.append(el("small", { textContent: `(${o.count})` }));
    b.disabled = !!o.disabled;
    b.setAttribute("aria-pressed", String(o.value === current));
    b.onclick = () => onPick(o.value);
    return b;
  }));
}
function renderChips() {
  const nAc = allBuses.filter((b) => b.is_ac).length;
  const nNon = allBuses.length - nAc;
  chipRow($("ac-chips"), [
    { value: "", label: "Any bus", count: allBuses.length },
    { value: "ac", label: "AC", count: nAc, disabled: nAc === 0 },
    { value: "nonac", label: "Non-AC", count: nNon, disabled: nNon === 0 },
  ], filters.ac, (v) => { filters.ac = v; renderChips(); render(); });

  const types = [...new Set(allBuses.map((b) => b.seat_type))];
  $("seat-group").hidden = types.length === 0;
  chipRow($("seat-chips"),
    [{ value: "", label: "Any", count: allBuses.length }, ...types.map((t) => ({
      value: t.toLowerCase(), label: t, count: allBuses.filter((b) => b.seat_type === t).length }))],
    filters.seat, (v) => { filters.seat = v; renderChips(); render(); });
}
$("f-sort").addEventListener("change", () => { filters.sort = $("f-sort").value; render(); });

// ---------- UI states ----------
function showLoading() {
  resultsEl.replaceChildren(); controlsEl.hidden = true; summaryEl.textContent = "";
  stateEl.replaceChildren(el("div", { className: "state", role: "status" },
    el("div", { className: "spinner" }), el("p", { textContent: "Searching buses…" })));
}
function showError(message) {
  resultsEl.replaceChildren(); controlsEl.hidden = true; summaryEl.textContent = "";
  const retry = el("button", { type: "button", className: "go", textContent: "Try again" });
  retry.onclick = () => form.requestSubmit();
  stateEl.replaceChildren(el("div", { className: "state error", role: "alert" },
    el("h2", { textContent: "Couldn't load buses" }), el("p", { textContent: message }), retry));
}
function showNoResults(text, withClear) {
  resultsEl.replaceChildren();
  const box = el("div", { className: "state" },
    el("h2", { textContent: "No buses found" }), el("p", { textContent: text }));
  if (withClear) {
    const clear = el("button", { type: "button", className: "go", textContent: "Clear filters" });
    clear.onclick = () => { filters.ac = ""; filters.seat = ""; filters.sort = ""; $("f-sort").value = ""; renderChips(); render(); };
    box.append(clear);
  } else {
    box.append(el("a", { className: "go as-link", href: "index.html", textContent: "Start a new search" }));
  }
  stateEl.replaceChildren(box);
}
function clearState() { stateEl.replaceChildren(); }

// ---------- search ----------
async function runSearch(source, destination, journey_date) {
  formError.hidden = true;
  setHeader(source || "…", destination || "…", journey_date || "");
  showLoading();
  $("search-btn").disabled = true;
  try {
    const qs = new URLSearchParams({ source, destination, journey_date });
    const res = await fetch(`${API_BASE}/api/buses/search?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
    allBuses = data.buses;
    lastSearch = { source, destination };
    filters.seat = ""; filters.sort = ""; $("f-sort").value = "";
    setHeader(source, destination, journey_date, allBuses.length);
    if (allBuses.length === 0) {
      summaryEl.textContent = ""; controlsEl.hidden = true;
      showNoResults(`No buses from ${source} to ${destination} on ${journey_date}. Try Bangalore → Mumbai on 09-08-2026.`);
      return;
    }
    renderChips();
    clearState(); controlsEl.hidden = false; render();
  } catch (err) {
    const offline = err instanceof TypeError;
    showError(offline ? "Can't reach the server. Is the backend running?" : err.message);
  } finally {
    $("search-btn").disabled = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const source = $("source").value.trim(), destination = $("destination").value.trim(), date = $("journey_date").value;
  if (!source || !destination || !date) {
    formError.textContent = "Enter source, destination and journey date.";
    formError.hidden = false; return;
  }
  // keep the URL in sync so refresh / sharing / back button all work
  const qs = new URLSearchParams({ source, destination, journey_date: date });
  history.replaceState(null, "", "results.html?" + qs.toString());
  runSearch(source, destination, date);
});

// ---------- filtering + sorting (browser side, on the fetched list) ----------
function visibleBuses() {
  let list = allBuses.filter((b) =>
    (!filters.ac || (filters.ac === "ac") === b.is_ac) &&
    (!filters.seat || b.seat_type.toLowerCase() === filters.seat));
  if (filters.sort === "price") list = [...list].sort((a, b) => a.fare - b.fare);
  if (filters.sort === "early") list = [...list].sort((a, b) => a.departure_minutes - b.departure_minutes);
  return list;
}
function render() {
  if (allBuses.length === 0) return;
  const list = visibleBuses();
  summaryEl.textContent = `Showing ${list.length} of ${allBuses.length} buses`;
  if (list.length === 0) { showNoResults("No buses match your choices. Try a different option.", true); return; }
  clearState();
  const minFare = Math.min(...allBuses.map((b) => b.fare));
  const minDur = Math.min(...allBuses.map((b) => b.duration_minutes));
  resultsEl.replaceChildren(...list.map((b) => busCard(b, minFare, minDur)));
}

function busCard(b, minFare, minDur) {
  const li = el("li", { className: "bus" });
  const low = b.seats_available <= 10;
  const details = el("button", { type: "button", className: "btn-ghost", textContent: "View details" });
  details.onclick = () => openDetails(b);
  const titleRow = el("div", { className: "title-row" }, el("h3", { textContent: b.operator }));
  if (b.fare === minFare) titleRow.append(el("span", { className: "badge", textContent: "Lowest fare" }));
  if (b.duration_minutes === minDur) titleRow.append(el("span", { className: "badge fast", textContent: "Fastest" }));

  li.append(
    el("div", { className: "main" },
      titleRow,
      el("div", { className: "type", textContent: b.bus_type }),
      el("div", { className: "route" },
        el("div", { className: "time" }, b.departure_time, el("small", { textContent: b.departure_date })),
        el("div", { className: "line", textContent: b.duration_text }),
        el("div", { className: "time end" }, b.arrival_time, el("small", { textContent: b.arrival_date || "" }))),
      el("div", { className: "tags" },
        el("span", { className: "tag" + (b.is_ac ? " ac" : ""), textContent: b.is_ac ? "AC" : "Non-AC" }),
        el("span", { className: "tag", textContent: b.seat_type }))),
    el("div", { className: "stub" },
      el("div", { className: "fare" }, inr(b.fare), el("small", { textContent: "per seat" })),
      el("div", { className: "seats" + (low ? " low" : ""), textContent: `${b.seats_available} seats left` }),
      details));
  return li;
}

// ---------- details dialog ----------
// Opens Google Maps directions to a stop. We search by name + city because
// many stops in the supplied data share the same placeholder coordinates.
function directionsUrl(stopName, city) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(`${stopName}, ${city}`);
}
function stopList(title, stops, city) {
  const ul = el("ul");
  stops.forEach((s) => ul.append(el("li", {},
    el("span", {}, s.name,
      s.is_nearest ? el("span", { className: "nearest", textContent: " · nearest" }) : "",
      s.contact && s.contact !== "0" ? el("div", { className: "c", textContent: s.contact }) : "",
      el("div", {}, el("a", { className: "dir", href: directionsUrl(s.name, city), target: "_blank", rel: "noopener", textContent: "Get directions" }))),
    el("span", { className: "t", textContent: s.time }))));
  return [el("h3", { textContent: title }), ul];
}
function pointSelect(label, stops) {
  const sel = el("select", {});
  stops.forEach((s, i) => sel.append(el("option", { value: String(i), textContent: `${s.name} (${s.time})` })));
  const nearest = stops.findIndex((s) => s.is_nearest);
  if (nearest >= 0) sel.value = String(nearest);
  return { sel, field: el("label", { className: "pick" }, el("span", { textContent: label }), sel) };
}
function showSelection(b, box) {
  const board = pointSelect("Boarding point", b.boarding_points);
  const drop = pointSelect("Dropping point", b.dropping_points);
  const summary = el("div", { className: "summary" });
  const update = () => {
    const bp = b.boarding_points[board.sel.value], dp = b.dropping_points[drop.sel.value];
    summary.replaceChildren(
      el("p", {}, el("strong", { textContent: `${lastSearch.source} → ${lastSearch.destination}` }), ` · ${b.departure_date}`),
      el("p", { textContent: `Board at ${bp.name} · ${bp.time}` }),
      el("p", { textContent: `Drop at ${dp.name} · ${dp.time}` }),
      el("p", {}, el("strong", { textContent: inr(b.fare) }), " per seat"));
  };
  board.sel.onchange = update; drop.sel.onchange = update;
  update();
  box.replaceChildren(el("div", { className: "selection" },
    el("h3", { textContent: "Your selection" }), board.field, drop.field, summary));
}
function openDetails(b) {
  $("dlg-title").textContent = `${b.operator} – ${b.bus_type}`;
  const cp = b.cancellation_policy;

  // "Select this bus" lets the user choose boarding + dropping points and shows a
  // summary. It does not pretend to confirm a booking (that is outside this assignment).
  const next = el("div", { className: "next" });
  const select = el("button", { type: "button", className: "go", textContent: "Select this bus" });
  select.onclick = () => showSelection(b, next);
  next.append(select);

  $("dlg-body").replaceChildren(
    next,
    el("p", { textContent: `Trip ${b.trip_id} · ${b.departure_time} → ${b.arrival_time} · ${b.duration_text} · ${inr(b.fare)}` }),
    el("p", { textContent: "Amenities: " + (b.amenities.join(", ") || "None listed") }),
    el("p", { textContent: cp ? `Cancellation: ${cp.is_cancellable ? "allowed" : "not allowed"}; reschedule ${cp.reschedule_allowed ? "allowed" : "not allowed"}.` : "" }),
    ...stopList("Boarding points", b.boarding_points, lastSearch.source),
    ...stopList("Dropping points", b.dropping_points, lastSearch.destination));
  $("details").showModal();
}
$("dlg-close").onclick = () => $("details").close();
$("details").addEventListener("click", (e) => { if (e.target === $("details")) $("details").close(); });

$("swap").onclick = () => {
  const a = $("source").value; $("source").value = $("destination").value; $("destination").value = a;
};

// ---------- start: read the search from the URL ----------
(function init() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has("source") && !p.has("destination") && !p.has("journey_date")) {
    window.location.replace("index.html"); return;
  }
  const source = (p.get("source") || "").trim(), destination = (p.get("destination") || "").trim(), date = p.get("journey_date") || "";
  $("source").value = source; $("destination").value = destination; $("journey_date").value = date;
  if (["ac", "nonac"].includes(p.get("ac"))) filters.ac = p.get("ac"); // preference chosen on the landing page
  runSearch(source, destination, date);
})();