/* ============================================================
   APP LOGIC
   ------------------------------------------------------------
   No prices anywhere by design — the shopping list is just
   "what to buy", since cost varies by shop. Everything here is
   plain vanilla JS so it runs straight from a GitHub Pages
   deploy or a double-clicked index.html, no build step needed.
============================================================= */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  renderWeek({ animate: true });
  renderShoppingList();
}

function rerollDinner(index) {
  const dinnerPool = [...byCategory("pasta"), ...byCategory("chicken"), ...byCategory("toastie")];
  const used = new Set(currentWeek.dinners.map((d) => d.id));
  const fresh = dinnerPool.filter((r) => !used.has(r.id));
  const choice = pickRandom(fresh.length ? fresh : dinnerPool, 1)[0];
  currentWeek.dinners[index] = choice;
  saveWeek(currentWeek);
  renderWeek({ animate: true, onlyIndex: index + 1 }); // +1 because index 0 in the DOM is the lunch block
  renderShoppingList();
}

function rerollLunch() {
  const lunchPool = byCategory("egg").filter((r) => r.id !== currentWeek.lunch.id);
  currentWeek.lunch = pickRandom(lunchPool.length ? lunchPool : byCategory("egg"), 1)[0];
  saveWeek(currentWeek);
  renderWeek({ animate: true, onlyIndex: 0 });
  renderShoppingList();
}

/* ---------------- rendering: block wall ---------------- */
function renderWeek(opts) {
  const options = opts || {};
  const wall = document.getElementById("block-wall");
  const empty = document.getElementById("week-empty");

  if (!currentWeek) {
    wall.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const blocks = [];
   
  // lunch block (batch wrap) — index 0 in the reroll/animate sense
  blocks.push(`
    <div class="meal-block bc-${currentWeek.lunch.blockColor}" data-recipe="${currentWeek.lunch.id}" data-slot-index="0" tabindex="0" role="button" aria-label="View recipe: ${currentWeek.lunch.name}">
      <span class="day-label">This week's batch</span>
      ${currentWeek.lunch.freezerBlock ? '<span class="freeze-mark">❄</span>' : ""}
      <span class="meal-name">${currentWeek.lunch.name}</span>
      <span class="slot-tag">Lunch</span>
      <button class="reroll-mini" data-reroll="lunch" aria-label="Reroll lunch wrap">↻</button>
    </div>
  `);

  currentWeek.dinners.forEach((d, i) => {
    blocks.push(`
      <div class="meal-block bc-${d.blockColor}" data-recipe="${d.id}" data-slot-index="${i + 1}" tabindex="0" role="button" aria-label="View recipe: ${d.name}">
        <span class="day-label">${DAYS[i]}</span>
        ${d.freezerBlock ? '<span class="freeze-mark">❄</span>' : ""}
        <span class="meal-name">${d.name}</span>
        <span class="slot-tag">Dinner</span>
        <button class="reroll-mini" data-reroll="${i}" aria-label="Reroll ${DAYS[i]}">↻</button>
      </div>
    `);
  });

  wall.innerHTML = blocks.join("");

  wall.querySelectorAll(".meal-block[data-recipe]").forEach((block) => {
    block.addEventListener("click", (e) => {
      if (e.target.closest(".reroll-mini")) return; // reroll handled separately below
      openModal(block.dataset.recipe);
    });
    block.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(block.dataset.recipe);
      }
    });
  });

  wall.querySelectorAll(".reroll-mini").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = btn.dataset.reroll;
      if (val === "lunch") rerollLunch();
      else rerollDinner(Number(val));
    });
  });

  if (options.animate) {
    runSlotAnimation(options.onlyIndex);
  }
}

/* ---------------- slot machine reveal ---------------- */
function runSlotAnimation(onlyIndex) {
  if (prefersReducedMotion) return; // final text is already showing — nothing further to do

  const dinnerPool = [...byCategory("pasta"), ...byCategory("chicken"), ...byCategory("toastie")];
  const lunchPool = byCategory("egg");

  let blocks = [...document.querySelectorAll(".meal-block[data-slot-index]")];
  if (typeof onlyIndex === "number") {
    blocks = blocks.filter((b) => Number(b.dataset.slotIndex) === onlyIndex);
  }

  blocks.forEach((block) => {
    const slotIndex = Number(block.dataset.slotIndex);
    const pool = slotIndex === 0 ? lunchPool : dinnerPool;
    const nameEl = block.querySelector(".meal-name");
    const finalName = nameEl.textContent;

    block.classList.add("spinning");
    block.style.pointerEvents = "none"; // block clicks mid-spin so the modal can't open on the wrong recipe

    const tickMs = 55;
    const spinMs = 420 + slotIndex * 90; // stagger so blocks settle left-to-right, cascading like a reel
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (Date.now() - startedAt >= spinMs) {
        clearInterval(timer);
        nameEl.textContent = finalName;
        block.classList.remove("spinning");
        block.classList.add("landed");
        block.style.pointerEvents = "";
        setTimeout(() => block.classList.remove("landed"), 350);
        return;
      }
      const guess = pool[Math.floor(Math.random() * pool.length)];
      if (guess) nameEl.textContent = guess.name;
    }, tickMs);
  });
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
            <span>${name}</span>
            <span class="qty">${qtys.join(" + ")}</span>
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
