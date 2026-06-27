'use strict';

/*
 * build-static.js — assemble the static demo into public/ for static hosts
 * (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
 *
 *   1. Snapshots the model's API OUTPUT into public/api-static/
 *      (delegates to scripts/snapshot-api.js — output arrays only, never the
 *      model parameters).
 *   2. Copies the sample CSVs into public/samples/ so the in-app "Try: …"
 *      sample buttons work without the Node server, which normally serves
 *      /samples live.
 *
 * The full Node server (server.js) does NOT need this — it serves /api/* and
 * /samples directly. Use this only for static deployments.
 *
 *   Run locally:  node scripts/build-static.js
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// 1. API snapshots (reuses the single source of truth).
execFileSync('node', [path.join(__dirname, 'snapshot-api.js')], { stdio: 'inherit' });

// 2. Sample datasets the in-app buttons reference at /samples/*.csv.
//    (Only the CSVs — the large demo .mp4 clips aren't needed in the app.)
const SAMPLE_FILES = [
    'co2_emissions.csv',
    'life_expectancy.csv',
    'renewable_energy_share.csv',
    'co2_per_capita_world.csv',
    'co2_vs_life_exp_2022.csv',
];
const srcDir = path.join(root, 'samples');
const dstDir = path.join(root, 'public', 'samples');
fs.mkdirSync(dstDir, { recursive: true });

let copied = 0;
for (const f of SAMPLE_FILES) {
    const src = path.join(srcDir, f);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dstDir, f));
        copied++;
    }
}

// 3. Scenario preset library — copy the plug-and-play .json files so they're
//    fetchable from the live demo at /samples/scenarios/*.json, not just the repo.
const scenSrc = path.join(srcDir, 'scenarios');
const scenDst = path.join(dstDir, 'scenarios');
let scenCopied = 0;
if (fs.existsSync(scenSrc)) {
    fs.mkdirSync(scenDst, { recursive: true });
    for (const f of fs.readdirSync(scenSrc)) {
        if (f.endsWith('.json') || f.endsWith('.md')) {
            fs.copyFileSync(path.join(scenSrc, f), path.join(scenDst, f));
            scenCopied++;
        }
    }
}

console.log(`Static build ready → public/  (copied ${copied} sample datasets, ${scenCopied} scenario files)`);
