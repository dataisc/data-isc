/**
 * starSchema.js
 *
 * Converts Data ISC output into three relational objects
 * suitable for Power BI and other BI tools.
 *
 * IMPORTANT: This module must NOT be called during rendering.
 * It runs downstream, after calculations complete, and only when an
 * export is triggered by the user.
 */

// Known statistical outliers in the dataset
const KNOWN_OUTLIERS = {
    'IRL_2015': { note: 'Ireland 2015: +25.2% GDP artefact from MNC intellectual property relocation (CSO modified GNI* introduced 2017)' },
    'IRL_2014': { note: 'Ireland 2014: MNC balance sheet reclassification artefact' },
    'LBY_2012': { note: 'Libya 2012: post-civil-war statistical base effect distortion' },
    'QAT_1993': { note: 'Qatar 1993: early LNG development base effect' },
};

const INCOME_GROUPS = {
    'USA':'Advanced','CHN':'Emerging','IND':'Emerging','DEU':'Advanced','JPN':'Advanced',
    'GBR':'Advanced','FRA':'Advanced','BRA':'Emerging','ITA':'Advanced','CAN':'Advanced',
    'KOR':'Advanced','RUS':'Emerging','AUS':'Advanced','ESP':'Advanced','MEX':'Emerging',
    'IDN':'Emerging','NLD':'Advanced','TUR':'Emerging','SAU':'Emerging','CHE':'Advanced',
    'POL':'Advanced','ARG':'Emerging','SWE':'Advanced','ARE':'Emerging','THA':'Emerging',
    'VNM':'Emerging','PHL':'Emerging','MYS':'Emerging','EGY':'Emerging','NGA':'Developing',
    'ZAF':'Emerging','COL':'Emerging','PAK':'Developing','BGD':'Developing','ETH':'Developing',
    'KEN':'Developing','BEL':'Advanced','NOR':'Advanced','IRL':'Advanced','DNK':'Advanced',
    'AUT':'Advanced','FIN':'Advanced','PRT':'Advanced','CZE':'Advanced','ROU':'Emerging',
    'GRC':'Advanced','HUN':'Emerging','UKR':'Emerging','SVK':'Advanced','BGR':'Emerging',
    'LUX':'Advanced','SRB':'Emerging','HRV':'Advanced','LTU':'Advanced','SVN':'Advanced',
    'LVA':'Advanced','EST':'Advanced','SGP':'Advanced','ISR':'Advanced','IRN':'Emerging',
    'IRQ':'Developing','QAT':'Emerging','KAZ':'Emerging','HKG':'Advanced','KWT':'Emerging',
    'NZL':'Advanced','CHL':'Emerging','PER':'Emerging','DZA':'Emerging','OMN':'Emerging',
    'MAR':'Emerging','VEN':'Emerging','LKA':'Emerging','DOM':'Emerging','ECU':'Emerging',
    'GTM':'Developing','AGO':'Developing','UZB':'Developing','TZA':'Developing','JOR':'Emerging',
    'PAN':'Emerging','MMR':'Developing','GHA':'Developing','CIV':'Developing','CRI':'Emerging',
    'AZE':'Emerging','CMR':'Developing','TUN':'Emerging','BOL':'Developing','PRY':'Emerging',
    'BHR':'Emerging','BLR':'Emerging','KHM':'Developing','HND':'Developing','SLV':'Developing',
    'NPL':'Developing','ZMB':'Developing','SEN':'Developing','LBY':'Developing','SDN':'Developing',
};

function getPeriod(year) {
    if (year <= 2025) return 'Historical';
    if (year <= 2040) return 'Near-term';
    if (year <= 2060) return 'Mid-term';
    return 'Long-term';
}

function getDecade(year) {
    return Math.floor(year / 10) * 10 + 's';
}

/**
 * Build the three star-schema tables from simulation output.
 *
 * @param {object} timeline      - TIMELINE object from the API (years[], countries[])
 * @param {object|null} scenarioResult - SCENARIO_RESULT or null for baseline
 * @param {string} scenarioId    - e.g. "baseline", "carbon_tax", "custom_se_asia"
 * @param {Array}  customDatasets - user-imported datasets (may be empty)
 * @returns {{ factSimulations: object[], dimCountries: object[], dimTime: object[] }}
 */
export function buildStarSchema(timeline, scenarioResult, scenarioId = 'baseline', customDatasets = []) {
    const { years, countries } = timeline;

    // Determine which countries have scenario delta data
    const scenarioCountrySet = new Set(
        scenarioResult
            ? Object.keys(scenarioResult.countryMap || {})
            : []
    );

    // ── dim_time ────────────────────────────────────────────────────
    const dimTime = years.map(year => ({
        Year:         year,
        Decade:       getDecade(year),
        Period:       getPeriod(year),
        IsProjection: year > 2025,
    }));

    // ── dim_countries ───────────────────────────────────────────────
    const dimCountries = countries
        .filter(c => !c.isAggregate)
        .map(c => ({
            CountryISO:  c.code,
            CountryName: c.name,
            Region:      c.region || 'Unknown',
            IncomeGroup: INCOME_GROUPS[c.code] || 'Emerging',
            IsInScenario: scenarioCountrySet.has(c.code),
        }));

    // ── fact_simulations ────────────────────────────────────────────
    const factSimulations = [];

    for (const country of countries) {
        if (country.isAggregate) continue;

        const baselineGdp = country.gdp; // array indexed by year position
        const scenarioCountry = scenarioResult?.countryMap?.[country.code];

        for (let yi = 0; yi < years.length; yi++) {
            const year = years[yi];
            const nominalGDP = baselineGdp[yi];

            // YoY growth %
            const gdpYoY = yi > 0 && baselineGdp[yi - 1] > 0
                ? ((nominalGDP / baselineGdp[yi - 1]) - 1) * 100
                : null;

            // GDP index (1990 = 1.0)
            const base90 = baselineGdp[0];
            const gdpIndex = base90 > 0 ? nominalGDP / base90 : null;

            // Population (if available) — use country.population if present
            const populationM = country.population ? country.population[yi] : null;

            // Per capita
            const gdpPerCapita = populationM && populationM > 0
                ? (nominalGDP * 1e12) / (populationM * 1e6)
                : null;

            // Per capita growth
            let gdpPerCapGrowth = null;
            if (populationM && yi > 0) {
                const prevNominal = baselineGdp[yi - 1];
                const prevPopM    = country.population?.[yi - 1];
                if (prevPopM && prevPopM > 0 && prevNominal > 0) {
                    const prevPerCap = (prevNominal * 1e12) / (prevPopM * 1e6);
                    const curPerCap  = (nominalGDP  * 1e12) / (populationM * 1e6);
                    gdpPerCapGrowth  = ((curPerCap / prevPerCap) - 1) * 100;
                }
            }

            // Scenario delta
            let scenarioDelta = null;
            if (scenarioResult && scenarioCountry) {
                const scenGdp = scenarioCountry.gdp?.[yi];
                if (scenGdp != null && nominalGDP > 0) {
                    scenarioDelta = ((scenGdp / nominalGDP) - 1) * 100;
                }
            }

            // Data source
            let dataSource;
            const isUserImport = customDatasets.some(ds =>
                ds.data?.some(row => row.CountryISO === country.code && row.Year === year)
            );
            if (isUserImport) {
                dataSource = 'user_import';
            } else if (year <= 2025) {
                dataSource = 'historical_imf';
            } else {
                dataSource = 'projection_model';
            }

            // Outlier check
            const outlierKey = `${country.code}_${year}`;
            const outlierInfo = KNOWN_OUTLIERS[outlierKey];
            const isOutlier   = !!outlierInfo;

            factSimulations.push({
                CountryISO:      country.code,
                Year:            year,
                ScenarioID:      scenarioId,
                NominalGDP:      nominalGDP,
                GDPGrowthYoY:    gdpYoY,
                GDPIndexBase90:  gdpIndex,
                GDPPerCapita:    gdpPerCapita,
                PopulationM:     populationM,
                GDPPerCapGrowth: gdpPerCapGrowth,
                ScenarioDelta:   scenarioDelta,
                DataSource:      dataSource,
                IsOutlier:       isOutlier,
                OutlierNote:     outlierInfo?.note ?? null,
            });
        }
    }

    return { factSimulations, dimCountries, dimTime };
}

/**
 * Convert an array of objects to CSV string.
 * Headers derived from first object's keys.
 */
export function objectsToCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape  = v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map(h => escape(row[h])).join(','));
    }
    return lines.join('\n');
}
