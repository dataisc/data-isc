'use strict';

const path = require('path');

// Milestone keyframe years — must match seed_data.json gdpMilestones array length
const MILESTONES = [1990, 2000, 2010, 2020, 2026, 2038, 2075, 2080, 2100];
// Milestones used up to and including 2038 (encodes confirmed near-term trajectory);
// simulation rules apply 2039–2100.
const HIST_CUTOVER = 2038;

// All simulation years
const YEARS = Array.from({ length: 111 }, (_, i) => 1990 + i);

// ── Global indicator arrays from baseline.json ───────────────────────────────
const baseline   = require(path.join(__dirname, 'baseline.json'));
const BL_MILES   = baseline.meta.milestones; // [1990,2026,2038,2075,2080,2100]
const FOSSIL_OIL = baseline.world.resources.fossil_fuel_reserves_remaining_pct.oil.milestone_values;
const COOPERATION= baseline.world.politics.multilateral_cooperation_index.milestone_values;

function interpBl(mv, year) {
    if (year <= BL_MILES[0]) return mv[0];
    if (year >= BL_MILES[BL_MILES.length - 1]) return mv[mv.length - 1];
    for (let i = 0; i < BL_MILES.length - 1; i++) {
        if (year >= BL_MILES[i] && year < BL_MILES[i + 1]) {
            const t = (year - BL_MILES[i]) / (BL_MILES[i + 1] - BL_MILES[i]);
            return mv[i] + (mv[i + 1] - mv[i]) * t;
        }
    }
    return mv[mv.length - 1];
}

function interpolate(g, year) {
    if (year <= MILESTONES[0]) return g[0];
    if (year >= MILESTONES[MILESTONES.length - 1]) return g[g.length - 1];
    for (let i = 0; i < MILESTONES.length - 1; i++) {
        if (year >= MILESTONES[i] && year <= MILESTONES[i + 1]) {
            const t = (year - MILESTONES[i]) / (MILESTONES[i + 1] - MILESTONES[i]);
            return g[i] + (g[i + 1] - g[i]) * t;
        }
    }
}

// ── Year-by-year simulation from HIST_CUTOVER → 2100 ────────────────────────
// Applies the same rules as engine.js (including aging tier 3 and population drag).
// Milestones used for 1990–2038; simulation rules drive 2039–2100.
// retiredShare / debtToGdp in seed_data reflect 2026 values; advance them to 2038
// before starting the simulation loop.
const MILESTONE_SEED_YEAR = 2026; // year seed_data demographic params are calibrated to
const ADVANCE_YEARS = HIST_CUTOVER - MILESTONE_SEED_YEAR; // 12

function simulateProjection(country) {
    const gdpArr = new Array(111); // index 0 = 1990

    // Historical + near-term: interpolate from milestones up to and including HIST_CUTOVER
    // gdpOverrides allows per-year GDP overrides for specific countries (e.g. conflict/crisis dips)
    for (let y = 1990; y <= HIST_CUTOVER; y++) {
        const ov = country.gdpOverrides && country.gdpOverrides[String(y)];
        gdpArr[y - 1990] = ov !== undefined ? +ov.toFixed(4) : +interpolate(country.gdpMilestones, y).toFixed(4);
    }

    // Advance demographic state from seed year (2026) to HIST_CUTOVER (2038)
    const gdp2038  = gdpArr[HIST_CUTOVER - 1990];
    let gdp        = gdp2038;
    let retired    = country.retiredShare + ADVANCE_YEARS * country.agingRatePerYear;
    const avgMilestoneRate = Math.pow(gdp2038 / gdpArr[MILESTONE_SEED_YEAR - 1990], 1 / ADVANCE_YEARS) - 1;
    let debtToGdp  = country.debtToGdp * Math.pow(avgMilestoneRate > 0.02 ? 0.997 : 1.003, ADVANCE_YEARS);

    for (let year = HIST_CUTOVER + 1; year <= 2100; year++) {
        let rate = country.baseGrowthRate;

        // Rule A — Debt drag
        if (debtToGdp > 100) rate -= 0.008;

        // Rule B — Aging stock drag (three tiers)
        if (retired > 20) rate -= 0.005;
        if (retired > 30) rate -= 0.005;
        if (retired > 35) rate -= 0.008; // demographic collapse

        // Rule B2 — Continuous aging drag: smooth year-over-year slowdown as retired share rises
        // Creates visible temporal dynamics on the YoY map (2039–2060); capped at 1.5%
        if (retired > 18) rate -= Math.min(0.015, (retired - 18) * 0.0006);

        // Rule G — Population decline drag (aging rate as workforce-shrinkage proxy)
        rate -= Math.max(0, country.agingRatePerYear - 0.10) * 0.04;

        // Rule H — Development convergence: catch-up growth decelerates as income rises
        // Only applies to very high-growth developing economies (baseGrowthRate > 5%)
        const gdpRatio = gdp / gdp2038;
        if (gdpRatio > 5 && country.baseGrowthRate > 0.05) {
            rate -= Math.min(0.025, (gdpRatio - 5) * 0.004);
        }
        if (gdpRatio > 9 && country.baseGrowthRate > 0.05) {
            rate -= Math.min(0.015, (gdpRatio - 9) * 0.003);
        }

        // Rule C — Fossil resource drag
        const fossil = interpBl(FOSSIL_OIL, year);
        if (fossil < 30) {
            rate -= ((30 - fossil) / 30) * (country.energyIntensity || 0.5) * 0.002;
        }

        // Rule D — Cooperation bonus
        const coop = Math.min(1, interpBl(COOPERATION, year));
        rate += (coop - 0.5) * 0.012;

        // Rule F — Growth floor: prevents implausible multi-decade contractions
        // Applied after all other rules; does not affect 2100 milestone calibration
        // because baseGrowthRate binary search still converges on the milestone target.
        if (country.growthFloor !== undefined) {
            rate = Math.max(country.growthFloor, rate);
        }

        gdp *= (1 + rate);
        gdpArr[year - 1990] = +gdp.toFixed(4);

        // Demographic shift
        retired    += country.agingRatePerYear;
        debtToGdp  *= (rate > 0.02) ? 0.997 : 1.003;
    }

    return gdpArr;
}

// Returns pre-computed GDP arrays for all countries (1990–2100) — no model params exposed
function buildTimeline(countries) {
    return {
        years: YEARS,
        countries: countries.map(c => ({
            name:        c.name,
            code:        c.code,
            region:      c.region,
            isAggregate: c.isAggregate || false,
            attrs:       c.attrs || {},
            gdp:         simulateProjection(c)
        }))
    };
}

function isAffected(country, scenario, scope, selectedCode) {
    if (scope === 'global') return true;
    if (scope === 'country') return country.code === selectedCode;
    // 'default': use scenario's preset affected_countries list (empty = all countries)
    const list = scenario.affected_countries || [];
    return list.length === 0 || list.includes(country.code);
}

// Per-country modifier based on scenario type and country attributes
// Returns a multiplier on the base annual_growth_impact (1.0 = average, range ~0.1–2.0)
function countryModifier(attrs, scenarioId, countryCode) {
    if (!attrs) return 1.0;
    const f = attrs.fossil_dependency    || 0.5;
    const t = attrs.trade_openness       || 0.5;
    const r = attrs.tech_readiness       || 0.5;
    const h = attrs.health_resilience    || 0.5;
    const v = attrs.fiscal_vulnerability || 0.5;
    const c = attrs.climate_exposure     || 0.5;

    switch (scenarioId) {
        // Carbon Tax — asymmetric impact model:
        //   Adjustment cost:  scales with fossil_dependency (transition pain)
        //   Export loss:      fossil-heavy × low-tech = fossil exporter → revenue collapse
        //   Clean-tech gain:  tech-rich × low-fossil → competitive in green exports (can go negative = net benefit)
        //   Fiscal capacity:  high fiscal_vulnerability = less buffer to absorb costs
        case 'POLICY_001': {
            // Norway: fossil_dependency attr (0.15) reflects clean domestic grid, not oil/gas EXPORT revenues.
            // As a major LNG/oil exporter, Norway loses fossil revenue under global carbon pricing.
            if (countryCode === 'NOR') return 0.72; // ~−6.5% at 10yr: oil/gas export revenue collapse
            const adjCost    = 1.2 * f;
            const exportLoss = 1.0 * f * (1 - r);
            const cleanGain  = 0.8 * r * (1 - f);
            const net        = adjCost + exportLoss - cleanGain;
            return Math.max(-0.4, Math.min(3.0, net * (1 + 0.3 * v)));
        }
        // Global Free Trade Expansion — country-specific model.
        // Winners: export-led EMs with labour cost advantage, standards-compliant advanced economies.
        // Losers: fossil exporters (demand destruction), import-substitution economies, weak-institution
        //         countries (capital flight risk), deindustrialising mid-income transition economies.
        // Negative modifiers → flip positive base to GDP loss.
        // Global aggregate: ~+2% at 10yr, ~+4% long-run (smaller EMs weighted in at long horizon).
        case 'POLICY_002': {
            const M002 = {
                // ── LABOUR-ABUNDANT MANUFACTURING SURGE ────────────────────────────
                VNM:  1.60,  // +10%: textiles/electronics tariff walls removed; FDI surge
                BGD:  1.44,  // +9%:  garment tariff elimination; EU/US market access unlocked
                KHM:  1.28,  // +8%:  manufacturing comparative advantage; FDI-driven
                ETH:  1.12,  // +7%:  lowest labour costs in Africa; new FDI pipelines open
                IDN:  0.88,  // +5.5%: commodities + manufacturing diversification; capital inflows
                IND:  0.72,  // +4.5%: IT/pharma/services boom; manufacturing relocation wave
                MEX:  0.65,  // +4%:  nearshoring deepens; tariff removal adds margin
                KOR:  0.65,  // +4%:  tech/auto exports; meets standards already; IP gains
                MMR:  0.49,  // +3%:  manufacturing relocation channel; low labour costs
                NPL:  0.40,  // +2.5%: remittances + tourism + small manufacturing FDI
                // ── STANDARDS-COMPLIANT ADVANCED EXPORTERS ─────────────────────────
                DEU:  0.49,  // +3%:  machinery/auto; standards-compliant; capital deepening
                SGP:  0.49,  // +3%:  financial hub; trade volumes surge; open capital gains
                CHE:  0.49,  // +3%:  pharma/precision/finance IP exports; global standards leader
                ISR:  0.49,  // +3%:  tech/pharma exports; high standards; strong FDI draw
                HKG:  0.49,  // +3%:  financial centre; trade intermediation; open capital
                EST:  0.40,  // +2.5%: digital/tech economy; highly open; strong FDI absorption
                PAN:  0.40,  // +2.5%: Canal logistics + financial hub + capital flows
                NLD:  0.40,  // +2.5%: logistics hub; high standards; FDI platform
                SWE:  0.40,  // +2.5%: tech/pharma; high standards; very open economy
                DNK:  0.40,  // +2.5%: pharma/shipping/services; standards leader
                LUX:  0.40,  // +2.5%: financial hub; capital market opening is net positive
                USA:  0.33,  // +2%:  tech/IP/services dominance; GDP↑ but inequality worsens
                JPN:  0.33,  // +2%:  auto/tech exports; commodity import cost savings
                THA:  0.33,  // +2%:  auto parts + electronics; partial relocation beneficiary
                PHL:  0.33,  // +2%:  BPO/services + electronics; garment tariff access
                KEN:  0.33,  // +2%:  services/floriculture; FDI under open capital
                IRL:  0.37,  // +2.25%: pharma/tech/MNC hub; services exports boom
                CAN:  0.37,  // +2.25%: tech + resources + services; USMCA-deepened
                NOR:  0.37,  // +2.25%: standards-compliant services/maritime (fossil drag modest)
                BEL:  0.37,  // +2.25%: logistics/chemicals; standards-compliant; EU trade hub
                NZL:  0.37,  // +2.25%: agriculture + services; clean-trade positioning
                POL:  0.37,  // +2.25%: EU-standard manufacturers gain global access
                CZE:  0.37,  // +2.25%: automotive/precision; EU-standard quality
                SVK:  0.33,  // +2%:  automotive exports; EU-integrated supply chain
                LTU:  0.33,  // +2%:  EU-standard; logistics; open economy
                LVA:  0.33,  // +2%:  EU-standard; open economy; services
                SVN:  0.33,  // +2%:  manufacturing + services; standards-compliant
                AUT:  0.33,  // +2%:  machinery/tourism; EU-standard; moderate gain
                FIN:  0.33,  // +2%:  forestry/tech; open capital; moderate gain
                ROU:  0.33,  // +2%:  EU-standard manufacturing + services; capital inflows
                CRI:  0.33,  // +2%:  tech/services + agriculture; CAFTA advantage
                HND:  0.33,  // +2%:  nearshoring from Mexico; CAFTA access
                CHN:  0.25,  // +1.5%: export volumes gain offset by standards pressure + labour cost erosion to VNM/BGD
                HUN:  0.25,  // +1.5%: EU-standard automotive manufacturing gain
                BGR:  0.25,  // +1.5%: manufacturing/services moderate gain
                MAR:  0.25,  // +1.5%: nearshoring from Europe; agriculture; services
                LKA:  0.25,  // +1.5%: garment exports; services; tariff wall removal
                UKR:  0.25,  // +1.5%: agriculture + services + reconstruction investment draw
                DOM:  0.25,  // +1.5%: tourism + services + manufacturing FDI
                SLV:  0.25,  // +1.5%: remittances + services; tariff access
                CHL:  0.25,  // +1.5%: copper partially offset by price compression; services/FDI gain
                JOR:  0.17,  // +1%:  services/tourism moderate; limited manufacturing
                GRC:  0.17,  // +1%:  shipping/tourism modest; limited export manufacturing
                PRY:  0.17,  // +1%:  agriculture + re-export trade; modest gain
                UZB:  0.17,  // +1%:  cotton + services; emerging manufacturing FDI
                SRB:  0.17,  // +1%:  manufacturing + services; EU accession path
                PER:  0.17,  // +1%:  minerals + agriculture; moderate gain
                GHA:  0.20,  // +1.2%: cocoa/gold + services; moderate gain
                SEN:  0.20,  // +1.2%: agriculture + services
                TZA:  0.25,  // +1.5%: agriculture + services; FDI draw
                HRV:  0.20,  // +1.2%: tourism + manufacturing moderate gain
                CMR:  0.10,  // +0.6%: mixed commodity + agriculture; modest gain
                GTM:  0.20,  // +1.2%: agriculture + nearshoring
                COL:  0.20,  // +1.2%: agriculture + services moderate
                // ── NEAR-ZERO / AMBIGUOUS ──────────────────────────────────────────
                GBR:  0.17,  // +1%:  financial services + tech gain; manufacturing exposed; Brexit friction
                AUS:  0.17,  // +1%:  agriculture + services; coal/LNG face price pressure
                ESP:  0.20,  // +1.2%: tourism + services + some manufacturing; mild positive
                PRT:  0.20,  // +1.2%: tourism + services; moderate gain
                BRA: -0.08,  // −0.5%: agriculture gain offset by deindustrialisation + institutional risk
                ZAF:  0.00,  // 0%:   mining + deindustrialisation risk + services offset each other
                MYS: -0.08,  // −0.5%: middle-income trap; caught between Vietnam's cost and Korea's tech
                TUR: -0.08,  // −0.5%: manufacturing cost pressure; institutional risk limits FDI
                // ── MODERATE LOSERS: Import-substitution and weak institutions ──────
                ITA: -0.25,  // −1.5%: SME manufacturing squeezed; slow standards adaptation
                FRA: -0.17,  // −1%:  agriculture protection eliminated; protected sectors exposed
                EGY: -0.33,  // −2%:  import-substitution collapse; capital flight risk
                PAK: -0.50,  // −3%:  protected industries exposed; capital flight; debt crisis risk
                ARG: -0.50,  // −3%:  chronic institutional failure; capital flight overwhelms trade gains
                NGA: -0.50,  // −3%:  fossil shock + weak institutions + nascent manufacturing
                KAZ: -0.33,  // −2%:  fossil + metals compression; limited manufacturing base
                AZE: -0.50,  // −3%:  oil dependency; limited diversification
                ZMB: -0.50,  // −3%:  copper price compression; debt exposure
                CIV: -0.10,  // −0.6%: cocoa price compression partially offsets market access
                BOL: -0.17,  // −1%:  fossil/mineral export compression; weak manufacturing
                ECU: -0.17,  // −1%:  oil + commodities; price compression
                SDN: -0.25,  // −1.5%: oil dependency + political instability
                BLR: -0.17,  // −1%:  manufacturing cost pressure; geopolitical/sanctions risk
                // ── SEVERE LOSERS: Fossil fuel mono-exporters ──────────────────────
                SAU: -1.09,  // −6.5%: fossil demand destruction; Vision 2030 insufficient buffer
                RUS: -1.33,  // −8%:  fossil collapse + no competitive manufacturing + sanctions
                IRN: -0.93,  // −5.5%: fossil fuels + sanctions + no diversified export base
                VEN: -1.17,  // −7%:  oil + institutional collapse + capital flight
                IRQ: -0.84,  // −5%:  near-total fossil dependency; no manufacturing base
                KWT: -0.84,  // −5%:  near-total fossil dependency
                QAT: -0.67,  // −4%:  LNG exposure; some services diversification as offset
                ARE: -0.67,  // −4%:  fossil exposure; Dubai services partially offset
                AGO: -0.76,  // −4.5%: single-commodity fossil exposure
                DZA: -0.76,  // −4.5%: fossil + weak diversification
                LBY: -0.84,  // −5%:  oil dependency + political instability compounds
                OMN: -0.67,  // −4%:  oil/LNG exposure; limited diversification
                BHR: -0.50,  // −3%:  partial financial hub; fossil demand drag
            };
            if (M002[countryCode] !== undefined) return M002[countryCode];
            // Fallback for unlisted countries: trade openness drives effect, but institutional quality gates capital
            const instScore = 1 - v; // fiscal_vulnerability inverted ≈ institutional strength proxy
            if (instScore < 0.40 && t < 0.40) return -0.10; // weak institution + low trade = capital flight risk
            return Math.max(-0.15, 0.10 + 0.7 * t);
        }
        // AI R&D pact: tech leaders gain most
        case 'POLICY_003': return 0.2 + 1.6 * r;
        // Debt restructuring: high fiscal vulnerability benefits most
        case 'POLICY_004': return 0.3 + 1.4 * v;
        // African dev, UBI: preset list, uniform
        case 'POLICY_005':
        case 'POLICY_008': return 1.0;
        // EU Federal Integration — country-specific model
        // Modifiers calibrated to target GDP level effects at +10yr horizon
        // (base annual_growth_impact = 0.009; modifier × 0.009 × 10 ≈ target %)
        case 'POLICY_007': {
            // Positive-sum: EU integration creates new value (defence consolidation, spread compression,
            // single market deepening, capital market union) — EU aggregate +5–8% at 10yr.
            // Gainers doubled vs formula baseline to reflect these positive-sum mechanisms.
            const M = {
                // ── EU GAINERS ─────────────────────────────────────────────────────
                GRC:  1.08,  // +9.7%  300–400bps spread compression saves ~4% GDP/yr in debt service
                ITA:  0.88,  // +7.9%  €50bn/yr interest savings; FDI reallocation; southern single market
                ESP:  0.66,  // +5.9%  bond integration; single market depth; defence burden share
                PRT:  0.66,  // +5.9%  bond integration; cohesion funds; fiscal space freed
                POL:  0.54,  // +4.9%  defence burden relief; single market access; FDI inflows
                ROU:  0.54,  // +4.9%  defence pooling; eastern FDI reallocation; cohesion
                HRV:  0.44,  // +4.0%  cohesion funds; FDI; Adriatic logistics integration
                BGR:  0.44,  // +4.0%  FDI reallocation; eastern catch-up; lower borrowing costs
                FRA:  0.44,  // +4.0%  spread compression; single market deepening; EU-level leadership role
                BEL:  0.34,  // +3.1%  cross-border investment; high-debt relief; Brussels hub status
                CZE:  0.34,  // +3.1%  reduced fragmentation; FDI; integrated supply chains
                SVK:  0.34,  // +3.1%  single market depth; automotive supply chain integration
                AUT:  0.20,  // +1.8%  modest gain; net contributor drag offset by market integration
                FIN:  0.20,  // +1.8%  modest gain; defence pooling benefit
                // ── EU LOSERS ──────────────────────────────────────────────────────
                IRL: -0.57,  // −5.1%  corporate tax harmonisation destroys low-tax model; MNC relocations
                HUN: -0.28,  // −2.5%  rule-of-law conditionality blocks cohesion fund access
                DEU: -0.17,  // −1.5%  permanent fiscal transfers; Bundesbank loses monetary influence
                NLD: -0.11,  // −1.0%  net contributor; Amsterdam finance hub competition intensifies
                SWE: -0.08,  // −0.7%  non-euro; loses monetary flexibility; sovereignty cost
                DNK: -0.08,  // −0.7%  non-euro; monetary flexibility loss; opt-out frictions
                LUX: -0.17,  // −1.5%  tax-haven model eroded by common corporate tax base
                // ── OUTSIDE EU LOSERS ──────────────────────────────────────────────
                RUS: -0.89,  // −8.0%  unified EU energy exit collapses gas/oil export revenue
                GBR: -0.22,  // −2.0%  financial services reallocation to Frankfurt/Paris/Amsterdam
                SAU: -0.22,  // −2.0%  fossil demand destruction as EU accelerates energy exit
                ARE: -0.22,  // −2.0%  same channel; some offset from EU-Gulf trade ties
                QAT: -0.22,  // −2.0%  LNG market share loss to renewables and Eurobond-backed green energy
                KWT: -0.22,  // −2.0%  same
                NOR: -0.05,  // −0.5%  partial fossil market loss; partially offset by NATO/EEA alignment
            };
            if (M[countryCode] !== undefined) return M[countryCode];
            // Remaining countries: slight positive from more coherent EU trade, aid, and regulatory policy
            return 0.05;
        }
        // US–China Trade War: country-specific effects — supply-chain winners get negative modifiers
        // (flip negative base to positive growth); hurt third-parties get positive modifiers.
        case 'POLICY_006': {
            const M006 = {
                // ── DIRECT ACTORS ───────────────────────────────────────────────────
                USA:  0.22,  // −4%   tariff inflation, supply-chain disruption, business uncertainty
                CHN:  0.33,  // −6%   export hit + tech decoupling + FDI confidence shock
                // ── SUPPLY-CHAIN RELOCATION WINNERS (negative → positive growth) ───
                VNM: -0.33,  // +6%   factories relocating from China; electronics/textiles boom
                MEX: -0.28,  // +5%   US nearshoring surge; USMCA preferential routing advantage
                IND: -0.11,  // +2%   some manufacturing relocation; IT services expand with US clients
                THA: -0.11,  // +2%   electronics/auto parts assembly relocation from China
                PHL: -0.08,  // +1.5% electronics & BPO sector expansion; US firm relocation
                IDN: -0.06,  // +1%   moderate manufacturing shift; nickel/battery supply chains
                BGD: -0.11,  // +2%   garment/low-end manufacturing exits China; orders surge
                MYS: -0.06,  // +1%   partial supply-chain beneficiary; semiconductor assembly
                // ── HURT THIRD PARTIES ──────────────────────────────────────────────
                KOR:  0.11,  // −2%   deeply integrated in both US/China tech supply chains; caught between blocs
                JPN:  0.08,  // −1.5% similar cross-bloc exposure; partially offset by US defence spending
                DEU:  0.11,  // −2%   China is Germany's largest trading partner; auto/machinery exports hit
                AUS:  0.17,  // −3%   iron ore & coal to China dominate export revenue; demand collapses
                SGP:  0.17,  // −3%   China logistics/finance entrepôt; bloc-splitting squeezes trade flows
                BRA:  0.08,  // −1.5% iron ore & soybeans to China; commodity demand contracts
                CAN:  0.06,  // −1%   supply-chain disruption; indirect US tariff spillover
                GBR:  0.06,  // −1%   financial exposure; tech-sector uncertainty; reduced FDI
            };
            if (M006[countryCode] !== undefined) return M006[countryCode];
            // Rest of world in global scope: small drag from trade uncertainty and bloc fragmentation
            return Math.max(0.0, 0.05 + 0.25 * t);
        }
        // Education: least-developed countries benefit most (inverse tech)
        case 'POLICY_009': return 0.2 + 1.6 * (1 - r);
        // Resource nationalisation: fossil-rich affected most (negative)
        case 'POLICY_010': return 0.2 + 1.6 * f;
        // Pandemic: weak health systems hit hardest
        case 'SHOCK_001': return 0.15 + 1.7 * (1 - h);
        // Financial crisis: open + fiscally vulnerable hit hardest
        case 'SHOCK_002': return Math.min(2.0, 0.2 + t + v);
        // US-China military: trade-dependent countries hit hardest
        case 'SHOCK_003': return 0.3 + 1.4 * t;
        // Climate breakdown: high-exposure countries hit hardest
        case 'SHOCK_004': return 0.15 + 1.7 * c;
        // AGI: tech leaders benefit most
        case 'SHOCK_005': return 0.1 + 1.8 * r;
        // Nuclear event: preset list, uniform
        case 'SHOCK_006': return 1.0;
        // Supply chain collapse: trade-dependent hurt most
        case 'SHOCK_007': return 0.2 + 1.6 * t;
        // China property: preset list (CHN/KOR/JPN), trade with China proxy
        case 'SHOCK_008': return 0.3 + 1.4 * t;
        // Energy crisis: fossil importers hurt most; exporters shielded or benefit.
        // Norway: fossil_dependency attr (0.15) captures domestic energy mix (clean hydro),
        // NOT oil/gas export revenues — override to reflect massive windfall revenue.
        case 'SHOCK_009': {
            if (countryCode === 'NOR') return -0.30; // +7.5% at 10yr: oil/gas export windfall
            if (countryCode === 'CAN') return -0.10; // +2.5%: net oil exporter; partial benefit
            return Math.max(0.05, 1.4 - 1.5 * f);
        }
        // Cyber attack: high-tech countries most exposed
        case 'SHOCK_010': return 0.2 + 1.6 * r;
        default: return 1.0;
    }
}

// Cumulative multiplier from startYear to targetYear under the scenario's event/recovery pattern
function scenarioFactor(scenario, startYear, targetYear, modifier) {
    if (targetYear <= startYear) return 1.0;
    const dur   = scenario.duration_years;
    const recov = scenario.recovery_years  || 0;
    const imp   = (scenario.annual_growth_impact || 0) * modifier;
    const boost = scenario.recovery_boost       || 0;
    let factor  = 1.0;
    for (let y = startYear; y < targetYear; y++) {
        const elapsed    = y - startYear;
        const inEvent    = dur === null || elapsed < dur;
        const inRecovery = dur !== null && elapsed >= dur && elapsed < dur + recov;
        if      (inEvent)    factor *= (1 + imp);
        else if (inRecovery) factor *= (1 + boost);
    }
    return factor;
}

// Returns full scenario timeline + 2100 delta table — sorted by scenario 2100 GDP
function buildScenario(countries, scenario, startYear, scope, selectedCode) {
    const result = countries.map(c => {
        const affected = isAffected(c, scenario, scope, selectedCode);
        const modifier = affected ? countryModifier(c.attrs, scenario.id, c.code) : 1.0;
        const gdp = YEARS.map(y => {
            const base = interpolate(c.gdpMilestones, y);
            if (!affected) return +base.toFixed(4);
            return +(base * scenarioFactor(scenario, startYear, y, modifier)).toFixed(4);
        });
        const baseline2100 = +interpolate(c.gdpMilestones, 2100).toFixed(4);
        const scenario2100 = gdp[110]; // index 110 = year 2100 (1990 + 110)
        return {
            name:          c.name,
            code:          c.code,
            region:        c.region,
            isAggregate:   c.isAggregate || false,
            affected,
            gdp,
            baseline2100,
            scenario2100,
            delta_pct: +((scenario2100 - baseline2100) / baseline2100 * 100).toFixed(2)
        };
    });

    return {
        scenarioId: scenario.id,
        startYear,
        scope,
        years: YEARS,
        countries: result.sort((a, b) => b.scenario2100 - a.scenario2100)
    };
}

// Stack multiple scenarios — compound their per-year factors multiplicatively
function buildMultiScenario(countries, scenarios, startYear, scope, selectedCode) {
    const result = countries.map(c => {
        const gdp = YEARS.map(y => {
            const base = interpolate(c.gdpMilestones, y);
            let factor = 1.0;
            for (const sc of scenarios) {
                const affected = isAffected(c, sc, scope, selectedCode);
                if (affected) {
                    const mod = countryModifier(c.attrs, sc.id, c.code);
                    factor *= scenarioFactor(sc, startYear, y, mod);
                }
            }
            return +(base * factor).toFixed(4);
        });
        const baseline2100 = +interpolate(c.gdpMilestones, 2100).toFixed(4);
        const scenario2100 = gdp[110];
        const affected = scenarios.some(sc => isAffected(c, sc, scope, selectedCode));
        return {
            name: c.name, code: c.code, region: c.region,
            isAggregate: c.isAggregate || false,
            affected, gdp, baseline2100, scenario2100,
            delta_pct: +((scenario2100 - baseline2100) / baseline2100 * 100).toFixed(2)
        };
    });
    return {
        scenarioId: scenarios.map(s => s.id).join('+'),
        startYear, scope, years: YEARS,
        countries: result.sort((a, b) => b.scenario2100 - a.scenario2100)
    };
}

module.exports = { buildTimeline, buildScenario, buildMultiScenario };
