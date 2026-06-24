# Contributing to Data ISC

Thanks for your interest in improving Data ISC! Bug reports, new scenarios, data corrections, sample datasets, and code are all welcome.

By contributing you agree to the [Contributor Licence Agreement](CLA.md) and to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Ways to contribute

| I want to… | Do this |
|------------|---------|
| Report a bug | Open a [bug report](https://github.com/dataisc/data-isc/issues/new?template=bug_report.yml) |
| Suggest a feature | Open a [feature request](https://github.com/dataisc/data-isc/issues/new?template=feature_request.yml) |
| Share a what-if scenario | Open a [scenario submission](https://github.com/dataisc/data-isc/issues/new?template=scenario_submission.yml) or a PR adding it under `samples/scenarios/` |
| Ask a question | Start a [discussion](https://github.com/dataisc/data-isc/discussions) |
| Report a vulnerability | Follow [SECURITY.md](SECURITY.md) — **do not** open a public issue |

---

## Local development

```bash
git clone https://github.com/dataisc/data-isc
cd data-isc
npm install
node server.js          # http://localhost:3000
```

Requires **Node.js ≥ 18**. There is no build step — the client is plain HTML/CSS/JS in `public/`, served by an Express server (`server.js`).

### Project layout

```
server.js                 Express server + API routes
scripts/snapshot-api.js   Pre-renders API output to static JSON (for the Pages demo)
models/gdp-trajectories/  GDP projection engine + private model data (server-side only)
public/                   The single-page client and documentation sub-pages
samples/                  Sample datasets and (optionally) community scenarios
```

### Building the static demo locally

The hosted demo serves pre-rendered API output so it works without a Node server:

```bash
node scripts/snapshot-api.js     # writes public/api-static/
```

Then open `public/index.html` through any static file server. CI does this automatically — see `.github/workflows/deploy-pages.yml`.

---

## Pull request guidelines

1. **Branch** from `main` and keep PRs focused — one logical change per PR.
2. **Match the surrounding style.** This codebase uses plain ES, 4-space indentation, and no transpiler. Don't introduce a framework or build tool without discussing it first.
3. **Keep the model server-side.** The browser must only ever receive computed output arrays — never growth rates, calibration coefficients, or scenario parameters. See the [Architecture](README.md#architecture) section. Any change that would leak model internals to the client will be rejected.
4. **Test manually.** Run `node server.js`, upload a sample dataset, and exercise the affected feature in the browser. Note what you tested in the PR description.
5. **Update docs** (README, `public/model/`) when behaviour changes.
6. Fill out the **pull request template** — it's there to speed up review.

---

## Contributing a scenario

Scenario JSON files are self-contained. To add one to the repository:

1. Author your JSON following the [schema in the README](README.md#custom-scenario-json-format).
2. Test it against one of the `samples/` datasets (or the built-in GDP demo).
3. Open a PR adding the file under `samples/scenarios/`, or attach it to a [scenario submission issue](https://github.com/dataisc/data-isc/issues/new?template=scenario_submission.yml).

---

## Response time

Issues and PRs are reviewed by a solo maintainer. Expect a first response within **10 days** — usually sooner. If you haven't heard back after two weeks, a polite comment bump on the issue or PR is welcome.

---

## Questions?

Open a [discussion](https://github.com/dataisc/data-isc/discussions) — we're happy to help.
