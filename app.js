/* ============================================================
   APP LOGIC
   ------------------------------------------------------------
   No prices anywhere by design — the shopping list is just
   "what to buy", since cost varies by shop. Everything here is
   plain vanilla JS so it runs straight from a GitHub Pages
   deploy or a double-clicked index.html, no build step needed.
============================================================= */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function visibleRecipes() {
  return RECIPES.filter((r) => !r.tags.some((t) => AVOID_TAGS.includes(t)));
}

function byCategory(cat) {
  return visibleRecipes().filter((r) => r.category === cat);
}

function pickRandom(arr, n) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < n) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/* ---------------- state ---------------- */
let currentWeek = loadWeek() || null; // { lunch: recipe, dinners: [recipe x7] }
let checkedItems = loadChecked();

function loadWeek() {
  try {
    const raw = localStorage.getItem("mealshuffle-week");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // rehydrate ids back to full recipe objects in case recipes.js changed
    const lunch = RECIPES.find((r) => r.id === parsed.lunchId) || null;
    const dinners = (parsed.dinnerIds || [])
      .map((id) => RECIPES.find((r) => r.id === id))
      .filter(Boolean);
    if (!lunch || dinners.length < 7) return null;
    return { lunch, dinners };
  } catch (e) {
    return null;
  }
}

function saveWeek(week) {
  localStorage.setItem(
    "mealshuffle-week",
    JSON.stringify({ lunchId: week.lunch.id, dinnerIds: week.dinners.map((d) => d.id) })
  );
}

function loadChecked() {
  try {
    return JSON.parse(localStorage.getItem("mealshuffle-checked") || "{}");
  } catch (e) {
    return {};
  }
}

function saveChecked() {
  localStorage.setItem("mealshuffle-checked", JSON.stringify(checkedItems));
}

/* ---------------- shuffle ---------------- */
function shuffleWeek() {
  const dinnerPool = [...byCategory("pasta"), ...byCategory("chicken"), ...byCategory("toastie")];
  const dinners = pickRandom(dinnerPool, 7);
  // pad with repeats if the pool is smaller than 7 (keeps it working as the library grows)
  while (dinners.length < 7 && dinnerPool.length) {
    dinners.push(dinnerPool[Math.floor(Math.random() * dinnerPool.length)]);
  }
  const lunchPool = byCategory("egg");
  const lunch = pickRandom(lunchPool, 1)[0];

  currentWeek = { lunch, dinners };
  checkedItems = {};
  saveChecked();
  saveWeek(currentWeek);
  renderWeek();
  renderShoppingList();
}

function rerollDinner(index) {
  const dinnerPool = [...byCategory("pasta"), ...byCategory("chicken"), ...byCategory("toastie")];
  const used = new Set(currentWeek.dinners.map((d) => d.id));
  const fresh = dinnerPool.filter((r) => !used.has(r.id));
  const choice = pickRandom(fresh.length ? fresh : dinnerPool, 1)[0];
  currentWeek.dinners[index] = choice;
  saveWeek(currentWeek);
  renderWeek();
  renderShoppingList();
}

function rerollLunch() {
  const lunchPool = byCategory("egg").filter((r) => r.id !== currentWeek.lunch.id);
  currentWeek.lunch = pickRandom(lunchPool.length ? lunchPool : byCategory("egg"), 1)[0];
  saveWeek(currentWeek);
  renderWeek();
  renderShoppingList();
}

/* ---------------- rendering: block wall ---------------- */
function renderWeek() {
  const wall = document.getElementById("block-wall");
  const empty = document.getElementById("week-empty");
  const actions = document.getElementById("week-actions");

  if (!currentWeek) {
    wall.innerHTML = "";
    empty.style.display = "block";
    actions.style.display = "none";
    return;
  }
  empty.style.display = "none";
  actions.style.display = "flex";

  const blocks = [];

  // lunch block (batch wrap)
  blocks.push(`
    <button class="meal-block bc-${currentWeek.lunch.blockColor}" data-recipe="${currentWeek.lunch.id}">
      <span class="day-label">This week's batch</span>
      <span class="meal-name">${currentWeek.lunch.name}</span>
      <span class="slot-tag">Lunch${currentWeek.lunch.freezerBlock ? " · freezes" : ""}</span>
      ${currentWeek.lunch.freezerBlock ? '<span class="freeze-mark">❄</span>' : ""}
    </button>
  `);

  currentWeek.dinners.forEach((d, i) => {
    blocks.push(`
      <button class="meal-block bc-${d.blockColor}" data-recipe="${d.id}">
        <span class="day-label">${DAYS[i]}</span>
        <span class="meal-name">${d.name}</span>
        <span class="slot-tag">Dinner${d.freezerBlock ? " · freezes" : ""}</span>
        ${d.freezerBlock ? '<span class="freeze-mark">❄</span>' : ""}
      </button>
    `);
  });

  wall.innerHTML = blocks.join("");

  wall.querySelectorAll("button.meal-block").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.recipe));
  });

  // reroll controls
  actions.innerHTML = `
    <button class="shuffle-btn reroll" id="reroll-lunch">↻ reroll lunch wrap</button>
    ${DAYS.map((d, i) => `<button class="shuffle-btn reroll" data-reroll-day="${i}">↻ reroll ${d}</button>`).join("")}
  `;
  document.getElementById("reroll-lunch").addEventListener("click", rerollLunch);
  actions.querySelectorAll("[data-reroll-day]").forEach((btn) => {
    btn.addEventListener("click", () => rerollDinner(Number(btn.dataset.rerollDay)));
  });
}

/* ---------------- ingredient quantity merging ---------------- */

// Units that get a plural "s" when the count isn't 1 — e.g. "clove" -> "cloves".
// Weight units (g) don't change form, so they're deliberately left out.
const PLURAL_UNITS = ["clove", "tin", "rasher", "slice", "wrap"];

// Units that sit directly against the number with no space: "200g", not "200 g".
const NO_SPACE_UNITS = ["g", "kg"];

// "200g" -> { value: 200, unit: "g" }
// "4 cloves" -> { value: 4, unit: "clove" }   (unit normalised, see below)
// "6" -> { value: 6, unit: "" }               (bare count, e.g. eggs)
// "for frying" -> null                        (doesn't start with a digit — can't be summed)
function parseQty(str) {
  const match = str.trim().match(/^(\d+(\.\d+)?)\s*(.*)$/);
  if (!match) return null;
  return { value: parseFloat(match[1]), unit: normaliseUnit(match[3]) };
}

// Lowercases and strips a trailing "s", so "Cloves" and "clove" are treated
// as the same unit when grouping.
function normaliseUnit(unit) {
  const lower = unit.trim().toLowerCase();
  return lower.length > 1 && lower.endsWith("s") ? lower.slice(0, -1) : lower;
}

// Reverse of normaliseUnit for display — only re-adds "s" for units that
// are actually in the pluralisable list, and only when the count isn't 1.
function formatQty(value, unit) {
  if (!unit) return `${value}`;
  const displayUnit = value !== 1 && PLURAL_UNITS.includes(unit) ? unit + "s" : unit;
  const separator = NO_SPACE_UNITS.includes(unit) ? "" : " ";
  return `${value}${separator}${displayUnit}`;
}

// Takes every raw qty string collected for one ingredient across the week's
// recipes, sums the ones that share a unit, and leaves anything unparseable
// or mismatched exactly as it was — same fallback behaviour as before.
function mergeQuantities(qtyStrings) {
  const totals = new Map(); // unit -> running total
  const leftovers = [];

  qtyStrings.forEach((str) => {
    const parsed = parseQty(str);
    if (!parsed) {
      leftovers.push(str);
      return;
    }
    totals.set(parsed.unit, (totals.get(parsed.unit) || 0) + parsed.value);
  });

  const summed = [...totals.entries()].map(([unit, total]) => formatQty(total, unit));
  return [...summed, ...leftovers].join(" + ");
}

/* ---------------- rendering: shopping list ---------------- */
function renderShoppingList() {
  const list = document.getElementById("shopping-list");
  const section = document.getElementById("shopping-section");
  if (!currentWeek) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  const all = [currentWeek.lunch, ...currentWeek.dinners];
  const merged = new Map(); // name -> [qty, qty...]
  all.forEach((r) => {
    r.ingredients.forEach((ing) => {
      if (!merged.has(ing.name)) merged.set(ing.name, []);
      merged.get(ing.name).push(ing.qty);
    });
  });

  const rows = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  list.innerHTML = rows
    .map(([name, qtys]) => {
      const key = name;
      const checked = !!checkedItems[key];
      return `
        <li class="${checked ? "checked" : ""}">
          <label>
            <input type="checkbox" data-item="${key}" ${checked ? "checked" : ""} />
            <div class="qty-line">
            <span>${name}</span>
            <span class="qty">${mergeQuantities(qtys)}</span>
            </div>
          </label>
        </li>
      `;
    })
    .join("");

  list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      checkedItems[cb.dataset.item] = cb.checked;
      saveChecked();
      cb.closest("li").classList.toggle("checked", cb.checked);
    });
  });
}

/* ---------------- rendering: library ---------------- */
let activeFilter = "all";

function renderLibrary() {
  const grid = document.getElementById("recipe-grid");
  const recipes = visibleRecipes().filter((r) => activeFilter === "all" || r.category === activeFilter);

  grid.innerHTML = recipes
    .map(
      (r) => `
      <button class="recipe-card" data-recipe="${r.id}">
        <span class="chip bc-${r.blockColor}">${r.category}${r.freezerBlock ? " · freezer block" : ""}</span>
        <h3>${r.name}</h3>
        <p>${r.blurb}</p>
      </button>
    `
    )
    .join("");

  grid.querySelectorAll(".recipe-card").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.recipe));
  });
}

function setFilter(cat) {
  activeFilter = cat;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === cat);
  });
  renderLibrary();
}

/* ---------------- modal ---------------- */
function openModal(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return;
  const backdrop = document.getElementById("modal-backdrop");
  document.getElementById("modal-chip").textContent = r.category + (r.freezerBlock ? " · freezer block" : "");
  document.getElementById("modal-chip").className = `chip bc-${r.blockColor}`;
  document.getElementById("modal-title").textContent = r.name;
  document.getElementById("modal-blurb").textContent = r.blurb;
  document.getElementById("modal-ingredients").innerHTML = r.ingredients
    .map((i) => `<li><span>${i.name}</span><span class="qty">${i.qty}</span></li>`)
    .join("");
  document.getElementById("modal-steps").innerHTML = r.steps.map((s) => `<li>${s}</li>`).join("");
  backdrop.classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-backdrop").classList.add("hidden");
}

/* ---------------- init ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("shuffle-btn").addEventListener("click", shuffleWeek);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  renderWeek();
  renderShoppingList();
  renderLibrary();
});
