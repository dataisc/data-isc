// Data ISC — engine.js
// Requires: seed_data.json, baseline.json

const countries = require('./seed_data.json');
const baseline  = require('./baseline.json');

const MILESTONES = baseline.meta.milestones; // [1990, 2026, 2038, 2075, 2080, 2100]

// Piecewise-linear interpolation between milestone keyframes
function interpolate(milestoneValues, year) {
    if (year <= MILESTONES[0]) return milestoneValues[0];
    if (year >= MILESTONES[MILESTONES.length - 1]) return milestoneValues[MILESTONES.length - 1];
    for (let i = 0; i < MILESTONES.length - 1; i++) {
        if (year >= MILESTONES[i] && year < MILESTONES[i + 1]) {
            const t = (year - MILESTONES[i]) / (MILESTONES[i + 1] - MILESTONES[i]);
            return milestoneValues[i] + t * (milestoneValues[i + 1] - milestoneValues[i]);
        }
    }
    return milestoneValues[MILESTONES.length - 1];
}

// ─── SCENARIO PARAMETERS ────────────────────────────────────────────────────
// Modify these to run what-if analyses. All values are multipliers or overrides.
const SCENARIO = {
    label:               "Baseline",
    tfpMultiplier:       1.0,   // 1.0 = baseline TFP trajectory; 0.5 = tech stagnation; 1.5 = acceleration
    fossilDepletionRate: 1.0,   // 1.0 = baseline depletion; >1 = faster exhaustion
    climateShockYear:    null,  // null = no shock; e.g. 2045 applies a 5-year growth hit of -20%
    cooperationBoost:    0.0,   // additive offset to global cooperation index (e.g. +0.2 = better multilateralism)
};
// ────────────────────────────────────────────────────────────────────────────

// Pre-extract global indicator milestone arrays for performance
const w = baseline.world;
const FOSSIL_OIL       = w.resources.fossil_fuel_reserves_remaining_pct.oil.milestone_values;
const COOPERATION      = w.politics.multilateral_cooperation_index.milestone_values;
const TFP              = w.technology.tfp_multiplier.milestone_values;

// Derived: annual TFP growth rate between consecutive years
function tfpGrowthRate(year) {
    const curr = interpolate(TFP, year);
    const prev = interpolate(TFP, year - 1);
    return (curr / prev) - 1; // e.g. 0.011 = 1.1% productivity gain this year
}

// ─── SIMULATION ─────────────────────────────────────────────────────────────
const results = [];

countries.forEach(country => {
    let gdp         = country.gdpTrillions;
    let retiredShare = country.retiredShare;
    let debtToGdp   = country.debtToGdp;

    for (let year = 2026; year <= 2100; year++) {

        // ── Base growth rate (per-country, calibrated to milestone trajectory) ──
        let growthRate = country.baseGrowthRate;

        // Rule A — Debt drag: high sovereign debt crowds out productive investment
        if (debtToGdp > 100) growthRate -= 0.008;

        // Rule B — Aging drag: shrinking labor force and rising dependency ratio
        if (retiredShare > 20) growthRate -= 0.005;
        if (retiredShare > 30) growthRate -= 0.005; // severe aging
        if (retiredShare > 35) growthRate -= 0.008; // demographic collapse tier (Japan/Korea 2050s+)

        // Rule G — Population decline drag: workforce shrinkage in fast-aging societies
        // agingRatePerYear is a proxy for the pace of working-age cohort decline.
        // Countries above the 0.10 threshold face a structural labour-supply headwind
        // proportional to how fast their population is aging.
        growthRate -= Math.max(0, country.agingRatePerYear - 0.10) * 0.04;

        // Rule C — Resource drag: fossil depletion raises energy costs below 30% reserve
        const fossilRemaining = interpolate(FOSSIL_OIL, year) / SCENARIO.fossilDepletionRate;
        if (fossilRemaining < 30) {
            const depletionSeverity = (30 - fossilRemaining) / 30;
            growthRate -= depletionSeverity * country.energyIntensity * 0.002;
        }

        // Rule D — Governance/cooperation modifier: multilateralism opens trade & investment
        const cooperation = Math.min(1, interpolate(COOPERATION, year) + SCENARIO.cooperationBoost);
        growthRate += (cooperation - 0.5) * 0.012;

        // Rule E — Technology TFP scenario lever
        // baseGrowthRate already encodes the baseline TFP trajectory, so only the *delta*
        // from the baseline multiplier (1.0) affects the current run.
        // tfpMultiplier=1.0 → no change; 0.5 → tech stagnation; 1.5 → acceleration
        const tfpDelta = tfpGrowthRate(year) * (SCENARIO.tfpMultiplier - 1.0);
        growthRate += tfpDelta;

        // Rule F — Optional climate shock: sudden event reduces growth for 5 years
        if (SCENARIO.climateShockYear !== null &&
            year >= SCENARIO.climateShockYear &&
            year <  SCENARIO.climateShockYear + 5) {
            growthRate *= 0.80;
        }

        // ── Compound GDP ──
        gdp *= (1 + growthRate);

        // ── Demographic shift ──
        retiredShare += country.agingRatePerYear;

        // ── Debt dynamics ──
        // Strong growth gradually improves debt ratio; stagnation worsens it
        if (growthRate > 0.02) {
            debtToGdp *= 0.997;
        } else {
            debtToGdp *= 1.003;
        }
    }

    results.push({
        name:       country.name,
        code:       country.code,
        region:     country.region || '—',
        startGdp:   country.gdpTrillions,
        endGdp:     gdp,
        endRetired: retiredShare,
        endDebt:    debtToGdp,
    });
});

// ─── OUTPUT ─────────────────────────────────────────────────────────────────
const totalStart = results.reduce((s, r) => s + r.startGdp, 0);
const totalEnd   = results.reduce((s, r) => s + r.endGdp,   0);

results.sort((a, b) => b.endGdp - a.endGdp);

console.log("=".repeat(62));
console.log(`   DATA ISC  (2026 → 2100)`);
console.log(`   Scenario: ${SCENARIO.label}`);
console.log("=".repeat(62) + "\n");

console.log("  2100 GDP RANKINGS (nominal USD)\n");
console.log(`  ${"#".padEnd(4)} ${"Country".padEnd(16)} ${"2026 GDP".padStart(10)} ${"2100 GDP".padStart(10)} ${"Growth".padStart(8)} ${"Retired%".padStart(9)}`);
console.log("  " + "-".repeat(58));

results.forEach((r, i) => {
    const multiplier = (r.endGdp / r.startGdp).toFixed(1) + "x";
    console.log(
        `  ${String(i + 1).padStart(2)}.  ` +
        `${r.name.padEnd(16)}` +
        `$${r.startGdp.toFixed(1).padStart(8)}T` +
        `  $${r.endGdp.toFixed(1).padStart(7)}T` +
        `  ${multiplier.padStart(6)}` +
        `  ${r.endRetired.toFixed(1).padStart(7)}%`
    );
});

console.log("  " + "-".repeat(58));
console.log(`  ${"TOTAL (10)".padEnd(20)} $${totalStart.toFixed(1).padStart(7)}T  $${totalEnd.toFixed(1).padStart(7)}T`);
console.log("\n  Baseline milestones for reference (from baseline.json):");
console.log("  USA: $28.5T → $70T | CHN: $19.2T → $75T | IND: $4.2T → $95T");
console.log("\n  To run a what-if scenario, edit the SCENARIO block at the top of engine.js.");
