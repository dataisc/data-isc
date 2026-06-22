# Scenario Library

Plug-and-play **what-if scenarios** mapped to real macroeconomic and demographic theories. Each file is self-contained JSON following the [scenario schema](../../README.md#custom-scenario-json-format) — no AI key, no setup.

## How to run one

1. Open the [live demo](https://dataisc.github.io/data-isc/) (or your own instance).
2. Load a dataset — the built-in **GDP demo** is loaded by default, or drag in one of the [`samples/`](../) CSVs.
3. Open the scenario builder and go to the **↑ JSON** tab.
4. Upload one of these `.json` files (or paste its contents).
5. Switch to the **Race**, **Chart**, or **Trajectories** view and watch it play out. Tip: use **⑂ Branch** mode to pit two scenarios against each other on one graph.

> These files import via the **↑ JSON** tab, so they use JSON (the importer doesn't parse YAML). The schema mirrors the in-app builder field-for-field, so you can also export any scenario you tweak in the UI and drop it back here.

## The library

| File | Theory | Best dataset | Shape |
|------|--------|--------------|-------|
| [`cyberpunk-2050.json`](cyberpunk-2050.json) | Automation singularity — capital/tech economies soar, labour-arbitrage economies stall | GDP demo | Wide divergence, 2026–2050 |
| [`ai-productivity-boom.json`](ai-productivity-boom.json) | Broad-based AI uplift — a rising tide, early adopters first | GDP demo | Positive, diffusing 2026–2050 |
| [`demographic-winter.json`](demographic-winter.json) | Global sub-replacement fertility over an 80-year horizon | GDP demo | Slow structural decline, 2026–2100 |
| [`great-decoupling.json`](great-decoupling.json) | Deglobalisation — trade-exposed hubs lose, self-sufficient economies hold | GDP demo | Front-loaded shock, 2026–2045 |
| [`rapid-decarbonisation.json`](rapid-decarbonisation.json) | Net-zero push — renewables share climbs, capped at 100% | `renewable_energy_share.csv` | Front-loaded growth, ceiling 100 |
| [`pandemic-decade.json`](pandemic-decade.json) | Recurring health shocks — dip-and-rebound waves | `life_expectancy.csv` | Phased dips + recoveries |

## Pairing ideas (Branch mode)

- **Cyberpunk 2050** vs **AI Productivity Boom** — concentrated vs broad-based automation gains.
- **Demographic Winter** vs baseline — how much fertility alone reshapes the 2100 ranking.
- **Great Decoupling** vs **Cyberpunk 2050** — geopolitics vs technology as the dominant 2045 force.

## Contribute your own

Have a theory? Author a JSON file following the [schema](../../README.md#custom-scenario-json-format), test it against one of the sample datasets, and open a pull request adding it here — or use the [scenario submission issue template](../../.github/ISSUE_TEMPLATE/scenario_submission.yml). See [CONTRIBUTING.md](../../CONTRIBUTING.md).

**Authoring notes:**

- `entity` names must match the dataset exactly (e.g. `United States`, not `USA`). Entities you omit from `entity_overrides` are excluded unless `default_delta_pct` applies to all.
- `phases` override `default_delta_pct` for their year window; per-entity overrides take precedence over phases.
- Set `growth_ceiling` for bounded datasets (e.g. `100` for percentage series like renewables share).
