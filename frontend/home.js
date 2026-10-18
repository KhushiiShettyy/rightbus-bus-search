// Landing page: collects the search, shows a welcome message, then opens results.html.
const $ = (id) => document.getElementById(id);
const form = $("search-form");
let acPref = ""; // "", "ac" or "nonac" – carried to the results page

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag); Object.assign(n, props); children.forEach((c) => n.append(c)); return n;
}

const CITY_INFO = {
  mumbai: ["Mumbai", "Gateway of India, Marine Drive sunsets and the city that never sleeps."],
  bangalore: ["Bangalore", "The Garden City: parks, cafés and India's tech capital."],
  bengaluru: ["Bengaluru", "The Garden City: parks, cafés and India's tech capital."],
};

function renderChips() {
  const opts = [["", "Any bus"], ["ac", "AC"], ["nonac", "Non-AC"]];
  $("ac-chips").replaceChildren(...opts.map(([v, label]) => {
    const b = el("button", { type: "button", className: "chip" + (v === acPref ? " on" : ""), textContent: label });
    b.setAttribute("aria-pressed", String(v === acPref));
    b.onclick = () => { acPref = v; renderChips(); };
    return b;
  }));
}

function showWelcome() {
  const raw = $("destination").value.trim();
  if (!raw) { $("welcome").hidden = true; return; }
  const info = CITY_INFO[raw.toLowerCase()];
  $("welcome-title").textContent = `Welcome to ${info ? info[0] : raw}!`;
  $("welcome-blurb").textContent = info ? info[1] : "Pick a journey date and search to see the buses.";
  // Only build the chips the first time. Rebuilding them on every 'change' event would
  // swallow the user's click when the destination box loses focus.
  if ($("welcome").hidden) { $("welcome").hidden = false; renderChips(); }
}
$("destination").addEventListener("change", showWelcome);
$("destination").addEventListener("input", () => {
  if (CITY_INFO[$("destination").value.trim().toLowerCase()]) showWelcome();
});

function go(source, destination, date) {
  const qs = new URLSearchParams({ source, destination, journey_date: date });
  if (acPref) qs.set("ac", acPref);
  window.location.href = "results.html?" + qs.toString();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const source = $("source").value.trim(), destination = $("destination").value.trim(), date = $("journey_date").value;
  if (!source || !destination || !date) {
    $("form-error").textContent = "Enter source, destination and journey date.";
    $("form-error").hidden = false; return;
  }
  $("form-error").hidden = true;
  go(source, destination, date);
});

$("swap").onclick = () => {
  const a = $("source").value; $("source").value = $("destination").value; $("destination").value = a; showWelcome();
};

// destination cards fill the form: first empty box gets the city
document.querySelectorAll(".dest").forEach((card) => card.addEventListener("click", () => {
  const city = card.dataset.city;
  if (!$("destination").value.trim()) $("destination").value = city;
  else if (!$("source").value.trim()) $("source").value = city;
  else $("destination").value = city;
  showWelcome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}));

$("quick-route").onclick = () => go("Bangalore", "Mumbai", "2026-08-09");
