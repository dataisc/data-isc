'use strict';

// Generic time-series scenario engine — shared between mcp-server.js and (as
// a source of truth) the browser code in public/index.html.
//
// The browser copy of _applyScenarioToData / _applyScenarioStack / BLACK_SWAN_PRESETS
// lives in index.html; keep the two in sync when changing core logic here.

// ── Time value parser ────────────────────────────────────────────────────────

function parseTimeValue(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // Plain year integer: 1990–2300
    const asNum = +s;
    if (!isNaN(asNum) && /^\d{4}$/.test(s) && asNum >= 1800 && asNum <= 2300)
        return { ms: new Date(asNum, 0, 1).getTime(), label: s, year: asNum, isYearInt: true };

    // Quarter: 2023-Q1 | 2023Q1 | Q1-2023 | Q1 2023
    const qm = s.match(/^(\d{4})[^\dq]?q(\d)$/i) ||
               s.match(/^q(\d)[^\d](\d{4})$/i)    ||
               s.match(/^q(\d)\s+(\d{4})$/i)      ||
               s.match(/^(\d{4})\s+q(\d)$/i);
    if (qm) {
        let year, q;
        if (qm[0].match(/^q/i)) { q = +qm[1]; year = +qm[2]; } else { year = +qm[1]; q = +qm[2]; }
        if (q >= 1 && q <= 4 && year >= 1800)
            return { ms: new Date(year, (q - 1) * 3, 1).getTime(), label: `${year}-Q${q}`, year, unit: 'quarter' };
    }

    // Half-year: 2023-H1 | H1 2023
    const hm = s.match(/^(\d{4})[^\d]?[hs](\d)$/i) || s.match(/^[hs](\d)[^\d]?(\d{4})$/i);
    if (hm) {
        let year, h;
        if (hm[0].match(/^[hs]/i)) { h = +hm[1]; year = +hm[2]; } else { year = +hm[1]; h = +hm[2]; }
        if (h >= 1 && h <= 2 && year >= 1800)
            return { ms: new Date(year, (h - 1) * 6, 1).getTime(), label: `${year}-H${h}`, year, unit: 'halfyear' };
    }

    // Fiscal year: FY2023 | FY23
    const fym = s.match(/^fy\s*(\d{2,4})$/i);
    if (fym) {
        let y = +fym[1];
        if (y < 100) y += y < 50 ? 2000 : 1900;
        return { ms: new Date(y, 6, 1).getTime(), label: `FY${y}`, year: y, unit: 'year' };
    }

    // Month name: Jan 2020 | January 2020 | Jan-2020
    const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const mnm = s.match(/^([a-z]{3,9})[^\d]*(\d{2,4})$/i) || s.match(/^(\d{4})[^\d]*([a-z]{3,9})$/i);
    if (mnm) {
        let mStr, yStr;
        const [, a, b] = mnm;
        if (/^\d/.test(a)) { yStr = a; mStr = b; } else { mStr = a; yStr = b; }
        const mIdx = MONTHS.indexOf(mStr.toLowerCase().slice(0, 3));
        if (mIdx >= 0) {
            let y = +yStr;
            if (y < 100) y += y < 50 ? 2000 : 1900;
            return { ms: new Date(y, mIdx, 1).getTime(), label: `${y}-${String(mIdx+1).padStart(2,'0')}`, year: y, unit: 'month' };
        }
    }

    // Compact month: 202301
    if (/^\d{6}$/.test(s)) {
        const y = +s.slice(0, 4), m = +s.slice(4, 6);
        if (y >= 1800 && m >= 1 && m <= 12)
            return { ms: new Date(y, m - 1, 1).getTime(), label: `${y}-${String(m).padStart(2,'0')}`, year: y, unit: 'month' };
    }

    // US date: MM/DD/YYYY
    const usm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usm) {
        const ms = new Date(+usm[3], +usm[1] - 1, +usm[2]).getTime();
        if (!isNaN(ms)) return { ms, label: s, year: +usm[3], unit: 'day' };
    }

    // EU date: DD.MM.YYYY
    const eum = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (eum) {
        const ms = new Date(+eum[3], +eum[2] - 1, +eum[1]).getTime();
        if (!isNaN(ms)) return { ms, label: s, year: +eum[3], unit: 'day' };
    }

    // ISO and other formats parseable by Date
    const d = new Date(s);
    if (!isNaN(d)) return { ms: d.getTime(), label: s, year: d.getFullYear(), unit: 'day' };

    return null;
}

// ── CSV / TSV parser ─────────────────────────────────────────────────────────

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return { columns: [], rows: [] };
    const delim = text.split('\n')[0].includes('\t') ? '\t' : ',';

    function parseLine(line) {
        const fields = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQ = !inQ; continue; }
            if (c === delim && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
            cur += c;
        }
        fields.push(cur.trim());
        return fields;
    }

    const columns = parseLine(lines[0]);
    const rows = lines.slice(1).filter(l => l.trim()).map(l => {
        const vals = parseLine(l);
        const row = {};
        columns.forEach((c, i) => { row[c] = vals[i] ?? ''; });
        return row;
    });
    return { columns, rows };
}

// ── Schema auto-detection ────────────────────────────────────────────────────
//
// Heuristics:
//   time  — column where ≥60% of sampled values parse as a date/year
//   value — most-numeric column that isn't the time column (≥70% numeric)
//   entity — first string column with low-to-medium cardinality that isn't time/value

function detectSchema(columns, rows) {
    const sample = rows.slice(0, Math.min(rows.length, 100));

    const scores = {};
    for (const col of columns) {
        const vals = sample.map(r => r[col]).filter(v => v !== '' && v != null);
        const total = vals.length || 1;
        scores[col] = {
            timeRate:    vals.filter(v => parseTimeValue(v) !== null).length / total,
            numericRate: vals.filter(v => !isNaN(parseFloat(String(v).replace(/[,$%]/g, '')))).length / total,
            uniqueCount: new Set(vals).size,
            total,
        };
    }

    const timeCol = columns
        .filter(c => scores[c].timeRate >= 0.6)
        .sort((a, b) => scores[b].timeRate - scores[a].timeRate)[0] ?? null;

    const valueCol = columns
        .filter(c => c !== timeCol && scores[c].numericRate >= 0.7)
        .sort((a, b) => scores[b].numericRate - scores[a].numericRate)[0] ?? null;

    const entityCol = columns
        .filter(c => c !== timeCol && c !== valueCol && scores[c].numericRate < 0.5)
        .sort((a, b) => scores[a].uniqueCount - scores[b].uniqueCount)[0] ?? null;

    const isGeo = entityCol ? /country|nation|iso|geo|region|province|state/i.test(entityCol) : false;

    return {
        keys: {
            time:     timeCol,
            value:    valueCol,
            geo:      isGeo ? entityCol : null,
            category: !isGeo ? entityCol : null,
        },
        signals: {
            temporal:    !!timeCol,
            geographic:  isGeo,
            categorical: !!entityCol && !!valueCol,
        },
        confidence: {
            time:   timeCol  ? +(scores[timeCol].timeRate  * 100).toFixed(0) + '%' : null,
            value:  valueCol ? +(scores[valueCol].numericRate * 100).toFixed(0) + '%' : null,
            entity: entityCol ? `${scores[entityCol].uniqueCount} unique values` : null,
        },
    };
}

// ── Black Swan preset library ────────────────────────────────────────────────

const BLACK_SWAN_PRESETS = [
    { id: 'automation-wave',  icon: '🤖', category: 'Technology', name: '2030 Automation Wave',
      headline: '+2.5%/yr', deltaPct: 2.5,
      description: 'Rapid industrial automation and AI adoption accelerate productivity growth — fast-moving entities compound the gains.',
      disperse: { stat: 'momentum', dir: +1, spread: 2.2 } },
    { id: 'fertility-crisis', icon: '👶', category: 'Demographic', name: 'Sub-Replacement Fertility Crisis',
      headline: '−1.8%/yr', deltaPct: -1.8,
      description: 'Birth rates collapse below replacement. Larger, mature entities feel the shrinking workforce hardest.',
      disperse: { stat: 'size', dir: -1, spread: 1.3 } },
    { id: 'decoupling-shock', icon: '🌐', category: 'Trade', name: 'Decoupling Shock',
      headline: '−2.2%/yr', deltaPct: -2.2,
      description: 'Global trade fragments into rival blocs. The biggest entities lose the most market access.',
      disperse: { stat: 'size', dir: -1, spread: 1.6 } },
    { id: 'pandemic-wave',    icon: '🦠', category: 'Health',      name: 'Pandemic Wave',
      headline: '−3.5%/yr', deltaPct: -3.5,
      description: 'A severe global pandemic disrupts activity — the most volatile, exposed entities swing the hardest.',
      disperse: { stat: 'volatility', dir: -1, spread: 2.2 } },
    { id: 'energy-shock',     icon: '⚡',  category: 'Macro',       name: 'Energy Price Shock',
      headline: '−2.5%/yr', deltaPct: -2.5,
      description: 'A prolonged spike in energy prices hits fast-growing, energy-hungry entities the hardest.',
      disperse: { stat: 'momentum', dir: -1, spread: 1.6 } },
];

// ── Preset dispersion ────────────────────────────────────────────────────────

function presetEntityStat(rows, schema, statName) {
    const groupKey = schema.keys.category || schema.keys.geo;
    const timeKey  = schema.keys.time;
    const valKey   = schema.keys.value;
    if (!groupKey || !timeKey || !valKey) return {};

    const toYear = raw => { const p = parseTimeValue(raw); return p ? p.year : null; };
    const num    = v => parseFloat(String(v).replace(/[,$%]/g, ''));
    const series = {};

    for (const row of rows) {
        const e = row[groupKey]; if (!e) continue;
        const y = toYear(row[timeKey]); if (y === null) continue;
        const v = num(row[valKey]); if (isNaN(v)) continue;
        (series[e] = series[e] || []).push([y, v]);
    }

    const out = {};
    for (const e of Object.keys(series)) {
        const pts = series[e].sort((a, b) => a[0] - b[0]);
        if (statName === 'size') {
            out[e] = pts[pts.length - 1][1];
        } else if (statName === 'momentum') {
            const first = pts[0][1], last = pts[pts.length - 1][1], yrs = pts[pts.length - 1][0] - pts[0][0];
            out[e] = (first > 0 && yrs > 0) ? Math.pow(last / first, 1 / yrs) - 1 : 0;
        } else if (statName === 'volatility') {
            const chg = [];
            for (let i = 1; i < pts.length; i++)
                if (pts[i - 1][1] !== 0) chg.push((pts[i][1] - pts[i - 1][1]) / Math.abs(pts[i - 1][1]));
            if (!chg.length) { out[e] = 0; continue; }
            const m = chg.reduce((s, x) => s + x, 0) / chg.length;
            out[e] = Math.sqrt(chg.reduce((s, x) => s + (x - m) ** 2, 0) / chg.length);
        }
    }
    return out;
}

function presetEntityOverrides(rows, schema, preset, baseDelta) {
    if (!preset.disperse) return [];
    const stats    = presetEntityStat(rows, schema, preset.disperse.stat);
    const entities = Object.keys(stats);
    if (entities.length < 2) return [];
    const vals = entities.map(e => stats[e]);
    const min  = Math.min(...vals), max = Math.max(...vals);
    if (max === min) return [];
    const { dir, spread } = preset.disperse;
    return entities.map(e => {
        const norm = 2 * (stats[e] - min) / (max - min) - 1; // normalised to [-1, +1]
        return { entity: e, delta_pct: +(baseDelta + dir * spread * norm).toFixed(2) };
    });
}

// ── Scenario engine ──────────────────────────────────────────────────────────
//
// scenario shape (internal, camelCase for yearFrom/yearTo/deltaPct to match
// the browser-side representation; snake_case entity_overrides / phases /
// growth_ceiling match the JSON import format):
//
//   { yearFrom, yearTo, deltaPct, entity_overrides?, phases?, growth_ceiling?,
//     entities?, aiImpacts? }
//
// normalizeScenario() accepts both camelCase and snake_case field names.

function normalizeScenario(sc) {
    return {
        ...sc,
        yearFrom: sc.yearFrom ?? sc.year_from,
        yearTo:   sc.yearTo   ?? sc.year_to,
        deltaPct: sc.deltaPct ?? sc.default_delta_pct ?? 0,
    };
}

function applyScenarioToData(data, schema, rawScenario) {
    const scenario = normalizeScenario(rawScenario);
    const { time, value } = schema.keys;
    const groupKey = schema.keys.category || schema.keys.geo;
    if (!time || !value) return data;

    const aiMap = {};
    if (scenario.aiImpacts?.length)
        for (const imp of scenario.aiImpacts)
            aiMap[String(imp.entity).toLowerCase()] = imp;
    const hasAI = Object.keys(aiMap).length > 0;

    const overrideMap = {};
    if (scenario.entity_overrides?.length)
        for (const o of scenario.entity_overrides)
            overrideMap[String(o.entity).toLowerCase()] = o.delta_pct;
    const hasOverrides = Object.keys(overrideMap).length > 0;

    const phases  = (scenario.phases || []).slice().sort((a, b) => a.year_from - b.year_from);
    const ceiling = scenario.growth_ceiling ?? null;
    const toYear  = raw => { const p = parseTimeValue(raw); return p ? p.year : null; };

    return data.map(row => {
        const year      = toYear(row[time]);
        if (year === null) return row;
        const entity    = groupKey ? String(row[groupKey]) : null;
        const entityKey = entity ? entity.toLowerCase() : null;

        let deltaPct, yearFrom, yearTo;

        if (hasAI) {
            if (entityKey && aiMap[entityKey]) {
                const imp = aiMap[entityKey];
                yearFrom = imp.yearFrom ?? scenario.yearFrom;
                yearTo   = imp.yearTo   ?? scenario.yearTo;
                deltaPct = imp.deltaPct;
            } else return row;
        } else if (hasOverrides) {
            if (entityKey !== null && overrideMap[entityKey] !== undefined) {
                yearFrom = scenario.yearFrom;
                yearTo   = scenario.yearTo;
                deltaPct = overrideMap[entityKey] ?? scenario.deltaPct;
            } else return row;
        } else {
            yearFrom = scenario.yearFrom;
            yearTo   = scenario.yearTo;
            deltaPct = scenario.deltaPct;
            const inScope = !scenario.entities?.length || (entity && scenario.entities.includes(entity));
            if (!inScope) return row;
        }

        if (year < yearFrom || year > yearTo) return row;

        const phase = phases.find(p => year >= p.year_from && year <= p.year_to);
        if (phase) deltaPct = phase.delta_pct;

        const yearsIn = year - yearFrom + 1;
        const factor  = Math.pow(1 + deltaPct / 100, yearsIn);
        let adjusted  = parseFloat(String(row[value]).replace(/[,$%]/g, '')) * factor;
        if (ceiling !== null) adjusted = Math.min(ceiling, adjusted);
        return { ...row, [value]: +adjusted.toFixed(4) };
    });
}

function applyScenarioStack(data, schema, scenarios) {
    return scenarios.reduce((acc, sc) => applyScenarioToData(acc, schema, sc), data);
}

module.exports = {
    parseTimeValue,
    parseCSV,
    detectSchema,
    BLACK_SWAN_PRESETS,
    presetEntityStat,
    presetEntityOverrides,
    normalizeScenario,
    applyScenarioToData,
    applyScenarioStack,
};
