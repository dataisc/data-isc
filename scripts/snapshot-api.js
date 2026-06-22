'use strict';

/*
 * snapshot-api.js — pre-render the server's API responses to static JSON.
 *
 * The live demo (GitHub Pages) serves only static files, but the client app
 * normally talks to /api/timeline, /api/scenarios and /api/simulate. This
 * script calls the same compute functions the server uses and writes their
 * OUTPUT (computed arrays only — never the model parameters) into
 * public/api-static/, so the client's static fallback can load them.
 *
 * Run locally:  node scripts/snapshot-api.js
 * Run in CI:    see .github/workflows/deploy-pages.yml
 */

const fs   = require('fs');
const path = require('path');

const { buildTimeline, buildScenario } = require('../models/gdp-trajectories/compute');
const countries = require('../models/gdp-trajectories/data/seed_data.json');
const policies  = require('../models/gdp-trajectories/data/scenarios_policy.json');

// Keep in sync with STATIC_SNAPSHOT_YEARS in public/index.html.
const START_YEARS = [2026, 2030, 2035, 2040, 2050];

// Mirror the server's whitelist so no model internals leak into the demo.
const SAFE_FIELDS = new Set([
    'id', 'name', 'icon', 'description', 'scope_default',
    'affected_countries', 'duration_years', 'recovery_years',
    'severity', 'tags',
]);
const sanitize = sc => Object.fromEntries(
    Object.entries(sc).filter(([k]) => SAFE_FIELDS.has(k))
);

const OUT = path.join(__dirname, '..', 'public', 'api-static');
const write = (rel, data) => {
    const file = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
};

fs.rmSync(OUT, { recursive: true, force: true });

// /api/timeline
write('timeline.json', buildTimeline(countries));

// /api/scenarios  (metadata only, same shape the server returns)
write('scenarios.json', { policy: policies.map(sanitize) });

// /api/simulate  — one snapshot per scenario × preset start year, scope=default
let simCount = 0;
for (const sc of policies) {
    for (const year of START_YEARS) {
        write(
            path.join('simulate', sc.id, `${year}.json`),
            buildScenario(countries, sc, year, 'default', null)
        );
        simCount++;
    }
}

console.log(
    `Snapshot complete → public/api-static/\n` +
    `  timeline.json, scenarios.json (${policies.length} scenarios)\n` +
    `  ${simCount} simulate snapshots (${policies.length} scenarios × ${START_YEARS.length} start years)`
);
