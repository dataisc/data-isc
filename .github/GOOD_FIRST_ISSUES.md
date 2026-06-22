# Good first issues — ready to file

Five small, well-scoped tasks for first-time contributors. After the repo is live on GitHub, create each as an issue and apply the labels shown (create the labels first if they don't exist: `good first issue` and `help wanted` are GitHub defaults).

> **Maintainer tip:** with the [`gh` CLI](https://cli.github.com/) you can file all five in seconds, e.g.
> ```bash
> gh issue create --title "Add a new scenario to the library" \
>   --label "good first issue,scenario" --body-file - <<'EOF'
> ...issue body...
> EOF
> ```

---

## 1. Add a new what-if scenario to the library
**Labels:** `good first issue`, `scenario`

The [`samples/scenarios/`](../samples/scenarios/) folder holds plug-and-play scenario JSON files mapped to real-world theories. Add one more.

- Pick a theory (e.g. *post-scarcity energy*, *climate migration*, *debt supercycle*, *open borders*).
- Author a JSON file following the [schema](../README.md#custom-scenario-json-format).
- Entity names must match a dataset exactly (see the GDP demo country list or a `samples/*.csv` header).
- Test it via the scenario builder's **↑ JSON** tab, then add a row to [`samples/scenarios/README.md`](../samples/scenarios/README.md).

**Good first PR because:** no app code to touch — just one JSON file and a table row.

---

## 2. Add a missing country to the GDP demo
**Labels:** `good first issue`, `data`

The built-in demo covers 100 countries + 5 regional aggregates. Add one that's missing (check `models/gdp-trajectories/data/seed_data.json`).

- Add an entry with the same fields as existing countries (name, code, baseline GDP, attributes).
- Use a credible public source (World Bank / IMF) for the baseline figure and note it in the PR.

**Good first PR because:** it's a single data object following an established pattern.

---

## 3. Polish a chart colour / theme value
**Labels:** `good first issue`, `frontend`

Colours and theme tokens live in [`style.css`](../style.css) / [`public/style.css`](../public/style.css) and [`public/theme.js`](../public/theme.js).

- Improve contrast of a chart series colour, fix a hard-to-read label in dark mode, or align a stray hex value with the theme palette.
- Include a before/after screenshot in the PR.

**Good first PR because:** visual, self-contained, easy to review.

---

## 4. Improve an accessibility label
**Labels:** `good first issue`, `a11y`

Some interactive controls in [`public/index.html`](../public/index.html) (view toggles, the time scrubber, export buttons) could use clearer `aria-label`s or keyboard focus styles.

- Pick one control, add a descriptive `aria-label` (or `aria-pressed` for toggles), and verify with a screen reader or the browser a11y inspector.

**Good first PR because:** small, high-value, and teaches accessible markup.

---

## 5. Add a sample dataset
**Labels:** `good first issue`, `data`

The [`samples/`](../samples/) folder has three demo CSVs. Add a fourth from a public source (e.g. internet users %, urban population %, electricity access %).

- CSV with `entity,year,value` shape (see existing files).
- Add a row to [`samples/README.md`](../samples/README.md) describing what to explore with it.

**Good first PR because:** no code, clear template, immediately useful in the app.

---

**For every PR:** see [CONTRIBUTING.md](../CONTRIBUTING.md). Be welcoming, review quickly, and thank contributors — that's how a first PR turns into a returning contributor.
