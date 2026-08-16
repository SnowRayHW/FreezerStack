# Freezer Stack

A small static site that shuffles a week of dinners plus a batch lunch wrap from a stack of recipes, then builds the combined shopping list. No prices anywhere — those vary by shop, so it only ever tells you *what* to buy.

Pure HTML/CSS/JS, no build step, no dependencies. Open `index.html` directly or serve it with GitHub Pages.

## Running it

- **Locally:** just double-click `index.html`, or run a tiny local server (`python3 -m http.server`) and visit it in a browser.
- **On GitHub Pages:** push this folder to a repo, then in the repo's Settings → Pages, set the source to the `main` branch, root folder. It'll be live at `https://<username>.github.io/<repo-name>/`.

## File structure

```
index.html    — page structure
style.css     — all styling (frost/freezer-block colour palette)
app.js        — shuffle logic, shopping list, filters, modal
recipes.js    — the recipe database — edit this to add/change recipes
```

## Editing recipes

Everything lives in `recipes.js` as a plain array. To add a recipe, copy an existing object and change the fields:

```js
{
  id: "unique-slug",
  name: "Display Name",
  category: "pasta" | "chicken" | "egg" | "toastie",
  slot: ["lunch"] or ["dinner"] or ["lunch", "dinner"],
  blockColor: "rust" | "olive" | "oxblood" | "mustard" | "cream",
  freezerBlock: true or false,
  blurb: "one line description",
  ingredients: [{ name: "...", qty: "..." }],
  steps: ["...", "..."],
  tags: [],
}
```

- `category` controls which pool the shuffle draws from — `pasta`, `chicken`, and `toastie` all feed the 7 dinner slots; `egg` feeds the weekly batch lunch wrap.
- `freezerBlock: true` shows a ❄ marker and note that it's meant to be batch-cooked and frozen.

## Avoiding ingredients

At the top of `recipes.js` there's:

```js
const AVOID_TAGS = ["pepper-chunk", "tomato-chunk", "fresh-fruit-chunk"];
```

Any recipe carrying one of these tags in its own `tags` array is automatically hidden from both the shuffle and the recipe library — nothing else needs to change. Add a new tag to `AVOID_TAGS` any time another ingredient needs excluding, and tag any recipe that contains it. Smooth/blended tomato (`tomato-smooth`, used in the sauce-block recipes) is a separate tag from `tomato-chunk`, since blended sauce and raw/diced tomato are treated differently.

## Data persistence

The current week's shuffle and shopping-list checkboxes are saved in the browser's `localStorage`, so they survive a page refresh. There's no backend — it's all client-side.

## Ideas to change stuff
Make the day tag in style on the block to be all at the same level, similar to the freezer icon.
Make the reroll button to be built onto the block itself, removing the "reroll _DAY_" string
Make the blocks Taller (about 1.4x) and wider (about 1.2x) to allow for button and for visual space.
Make the frozen icon more prominent (1.2x larger) and also add a blue gradient overlay. (I removed the "freezes" wording looks meh)
# BIG ONE
Make the shuffle like a slot machine animation...
