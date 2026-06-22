'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const { buildTimeline, buildScenario, buildMultiScenario } = require('./models/gdp-trajectories/compute');

// Private data — loaded once at startup, never served as static files
const countries = require('./models/gdp-trajectories/data/seed_data.json');
const policies  = require('./models/gdp-trajectories/data/scenarios_policy.json');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/samples', express.static(path.join(__dirname, 'samples')));

// ── Pre-cache the timeline so it's computed once ────────────────────
const TIMELINE_CACHE = buildTimeline(countries);

// ── Safe scenario fields sent to client (no effects/rates/impacts) ──
const SAFE_FIELDS = new Set([
    'id', 'name', 'icon', 'description', 'scope_default',
    'affected_countries', 'duration_years', 'recovery_years',
    'severity', 'tags'
]);
const sanitize = sc => Object.fromEntries(
    Object.entries(sc).filter(([k]) => SAFE_FIELDS.has(k))
);

// ── Routes ──────────────────────────────────────────────────────────

// Full yearly GDP timeline for all countries, 1990–2100
app.get('/api/timeline', (_req, res) => {
    res.json(TIMELINE_CACHE);
});

// Scenario cards: metadata only
app.get('/api/scenarios', (_req, res) => {
    res.json({
        policy: policies.map(sanitize)
    });
});

// Simulate one or more scenarios
app.get('/api/simulate', (req, res) => {
    const { id, ids, start, scope, country } = req.query;
    const startYear = parseInt(start, 10);
    if (isNaN(startYear) || startYear < 2026 || startYear > 2080)
        return res.status(400).json({ error: 'start (2026–2080) required' });

    const allScenarios = [...policies];
    const idList = (ids || id || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!idList.length) return res.status(400).json({ error: 'id(s) required' });

    const scenarioList = idList.map(sid => allScenarios.find(s => s.id === sid)).filter(Boolean);
    if (!scenarioList.length) return res.status(404).json({ error: 'Unknown scenario id(s)' });

    const validScopes = ['global', 'default', 'country'];
    const resolvedScope = validScopes.includes(scope) ? scope : 'default';

    res.json(scenarioList.length === 1
        ? buildScenario(countries, scenarioList[0], startYear, resolvedScope, country || null)
        : buildMultiScenario(countries, scenarioList, startYear, resolvedScope, country || null)
    );
});

// ── Dev-only: save a recorded sample clip to /samples ───────────────
// Used to generate README/GitHub demo clips from the in-browser recorder.
// Disabled outside development; safe to remove once samples are captured.
if (process.env.NODE_ENV !== 'production') {
    const fs = require('fs');
    app.post('/api/save-sample', express.raw({ type: 'application/octet-stream', limit: '64mb' }), (req, res) => {
        const name = String(req.query.name || '').replace(/[^a-z0-9._-]/gi, '');
        if (!name) return res.status(400).json({ error: 'name required' });
        const dir = path.join(__dirname, 'samples');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), req.body);
        res.json({ ok: true, name, bytes: req.body.length });
    });
}

// ── FX rates proxy (avoids browser CORS on third-party APIs) ────────
// GET /api/fx  →  { rates: { EUR: 0.91, CNY: 7.2, ... }, date: "2026-06-20" }
app.get('/api/fx', async (_req, res) => {
    try {
        const r = await fetch('https://api.frankfurter.app/latest?from=USD');
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        const d = await r.json();
        res.set('Cache-Control', 'public, max-age=3600'); // cache 1 h
        res.json({ rates: d.rates, date: d.date });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ── CSV from URL proxy (avoids browser CORS, blocks SSRF) ────────────
app.get('/api/fetch-csv', async (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).json({ error: 'url required' });

    let parsed;
    try { parsed = new URL(raw); } catch { return res.status(400).json({ error: 'invalid url' }); }

    if (!['http:', 'https:'].includes(parsed.protocol))
        return res.status(400).json({ error: 'only http/https allowed' });

    // Block private / loopback ranges (SSRF protection)
    const host = parsed.hostname;
    const BLOCKED = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|0\.0\.0\.0)/i;
    if (BLOCKED.test(host)) return res.status(403).json({ error: 'private addresses not allowed' });

    try {
        const r = await fetch(raw, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'DataISC/1.0' },
        });
        if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });

        const contentType = r.headers.get('content-type') || '';
        const bytes = await r.arrayBuffer();
        if (bytes.byteLength > 20 * 1024 * 1024)
            return res.status(413).json({ error: 'file too large (max 20 MB)' });

        res.set('Content-Type', contentType || 'text/plain');
        res.send(Buffer.from(bytes));
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.info(`
/*
 * ============================================
 * DATA ISC — OPEN SOURCE
 * ============================================
 * Licence:     AGPLv3 (open / academic use)
 * Commercial:  license@dataisc.dev
 * Repository:  https://github.com/dataisc/data-isc
 * Docs:        /model  /licence  /disclaimer
 * ============================================
 * If you are using this engine in a commercial
 * product or service, a commercial licence is
 * required. See /licence or contact us above.
 * ============================================
 */`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Model data is server-side only — not exposed to clients\n`);
});
