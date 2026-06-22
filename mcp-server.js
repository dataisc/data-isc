'use strict';

/**
 * Data ISC — MCP Server (stdio transport)
 *
 * Exposes the GDP simulation engine as MCP tools so AI agents
 * (Claude Desktop, Cursor, etc.) can query and simulate directly.
 *
 * Usage:
 *   node mcp-server.js
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "data-isc": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/mcp-server.js"]
 *       }
 *     }
 *   }
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const { buildTimeline, buildScenario, buildMultiScenario } = require('./models/gdp-trajectories/compute');

const countries = require('./models/gdp-trajectories/data/seed_data.json');
const policies  = require('./models/gdp-trajectories/data/scenarios_policy.json');

// Pre-compute baseline timeline once
const TIMELINE = buildTimeline(countries);

// Fields we're allowed to expose from scenario definitions
const SAFE_FIELDS = new Set([
    'id', 'name', 'icon', 'description', 'scope_default',
    'affected_countries', 'duration_years', 'recovery_years',
    'severity', 'tags'
]);
const sanitize = sc => Object.fromEntries(Object.entries(sc).filter(([k]) => SAFE_FIELDS.has(k)));

// ── Helpers ─────────────────────────────────────────────────────────────────

function countryList() {
    return countries.map(c => ({ code: c.code, name: c.name, region: c.region }));
}

function pickYears(timeline, fromYear, toYear) {
    return timeline.filter(row => row.year >= fromYear && row.year <= toYear);
}

function formatTable(rows, cols) {
    const lines = [cols.join('\t')];
    for (const row of rows) lines.push(cols.map(c => row[c] ?? '').join('\t'));
    return lines.join('\n');
}

function gdpTrillions(v) {
    return v == null ? null : +(v / 1e12).toFixed(3);
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
    name: 'data-isc',
    version: '1.0.0',
});

// ── Tool: list_countries ─────────────────────────────────────────────────────
server.tool(
    'list_countries',
    'List all countries and regional aggregates in the GDP model, with their codes and regions.',
    {},
    async () => {
        const list = countryList();
        const text = list.map(c => `${c.code}  ${c.name}  [${c.region}]`).join('\n');
        return {
            content: [{ type: 'text', text: `${list.length} entities:\n\n${text}` }],
        };
    }
);

// ── Tool: list_scenarios ─────────────────────────────────────────────────────
server.tool(
    'list_scenarios',
    'List all available what-if policy scenarios with their IDs, names, descriptions, and severity.',
    {},
    async () => {
        const safe = policies.map(sanitize);
        const lines = safe.map(s =>
            `[${s.id}] ${s.icon || ''} ${s.name} (${s.severity})\n  ${s.description}`
        );
        return {
            content: [{ type: 'text', text: lines.join('\n\n') }],
        };
    }
);

// ── Tool: get_gdp ────────────────────────────────────────────────────────────
server.tool(
    'get_gdp',
    'Get baseline GDP trajectory for one or more countries over a year range. Returns nominal USD values.',
    {
        countries: z.string().describe(
            'Comma-separated country codes (e.g. "USA,CHN,IND"). Use list_countries to find codes.'
        ),
        from_year: z.number().int().min(1990).max(2100).default(2025)
            .describe('Start year (1990–2100)'),
        to_year: z.number().int().min(1990).max(2100).default(2050)
            .describe('End year (1990–2100)'),
        unit: z.enum(['trillions', 'raw']).default('trillions')
            .describe('trillions = USD trillions (easier to read); raw = exact USD'),
    },
    async ({ countries: codesStr, from_year, to_year, unit }) => {
        const codes = codesStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const rows  = pickYears(TIMELINE, from_year, to_year);

        if (!rows.length) {
            return { content: [{ type: 'text', text: 'No data for the requested year range.' }] };
        }

        const lines = ['year\t' + codes.join('\t')];
        for (const row of rows) {
            const vals = codes.map(code => {
                const val = row.countries?.[code];
                if (val == null) return 'N/A';
                return unit === 'trillions' ? gdpTrillions(val) : val;
            });
            lines.push(`${row.year}\t${vals.join('\t')}`);
        }

        const unitLabel = unit === 'trillions' ? 'USD trillions (nominal)' : 'USD (nominal)';
        return {
            content: [{
                type: 'text',
                text: `GDP baseline — ${unitLabel}\n\n${lines.join('\n')}`,
            }],
        };
    }
);

// ── Tool: get_top_economies ──────────────────────────────────────────────────
server.tool(
    'get_top_economies',
    'Get the top N economies by GDP for a specific year.',
    {
        year: z.number().int().min(1990).max(2100).default(2050)
            .describe('Year to rank (1990–2100)'),
        top_n: z.number().int().min(1).max(50).default(10)
            .describe('Number of top economies to return'),
    },
    async ({ year, top_n }) => {
        const row = TIMELINE.find(r => r.year === year);
        if (!row) return { content: [{ type: 'text', text: `No data for year ${year}.` }] };

        const ranked = Object.entries(row.countries)
            .filter(([, v]) => v != null)
            .sort(([, a], [, b]) => b - a)
            .slice(0, top_n);

        const lines = ranked.map(([code, val], i) => {
            const c = countries.find(x => x.code === code);
            return `${String(i + 1).padStart(2)}. ${code}  ${c?.name ?? code}  $${gdpTrillions(val)}T`;
        });

        return {
            content: [{
                type: 'text',
                text: `Top ${top_n} economies by GDP in ${year} (nominal USD):\n\n${lines.join('\n')}`,
            }],
        };
    }
);

// ── Tool: run_scenario ───────────────────────────────────────────────────────
server.tool(
    'run_scenario',
    'Run one or more what-if policy scenarios and return GDP trajectories showing baseline vs scenario impact.',
    {
        scenario_ids: z.string().describe(
            'Comma-separated scenario IDs (e.g. "carbon_tax" or "carbon_tax,free_trade"). Use list_scenarios to find IDs.'
        ),
        start_year: z.number().int().min(2026).max(2080).default(2026)
            .describe('Year the scenario shock begins (2026–2080)'),
        scope: z.enum(['global', 'default']).default('default')
            .describe('"default" uses each scenario\'s own geographic scope; "global" applies it worldwide'),
        countries: z.string().optional().describe(
            'Optional — comma-separated codes to filter output (e.g. "USA,CHN"). Returns all if omitted.'
        ),
        from_year: z.number().int().min(1990).max(2100).default(2025)
            .describe('Output start year'),
        to_year: z.number().int().min(1990).max(2100).default(2060)
            .describe('Output end year'),
        unit: z.enum(['trillions', 'raw']).default('trillions'),
    },
    async ({ scenario_ids, start_year, scope, countries: filterStr, from_year, to_year, unit }) => {
        const ids = scenario_ids.split(',').map(s => s.trim()).filter(Boolean);
        const scenarioList = ids.map(id => policies.find(s => s.id === id)).filter(Boolean);

        if (!scenarioList.length) {
            const valid = policies.map(s => s.id).join(', ');
            return {
                content: [{
                    type: 'text',
                    text: `Unknown scenario ID(s). Valid IDs: ${valid}`,
                }],
            };
        }

        const result = ids.length === 1
            ? buildScenario(countries, scenarioList[0], start_year, scope, null)
            : buildMultiScenario(countries, scenarioList, start_year, scope, null);

        const filterCodes = filterStr
            ? filterStr.split(',').map(s => s.trim().toUpperCase())
            : null;

        const baseRows     = pickYears(TIMELINE, from_year, to_year);
        const scenarioRows = pickYears(result, from_year, to_year);

        // Build a readable comparison table
        const codesToShow = filterCodes
            ?? Object.keys(baseRows[0]?.countries ?? {}).slice(0, 10);

        const lines = [];
        const scenarioNames = scenarioList.map(s => s.name).join(' + ');
        lines.push(`Scenario: ${scenarioNames} (shock starts ${start_year})`);
        lines.push(`Output: nominal USD ${unit === 'trillions' ? 'trillions' : ''}\n`);

        // Header
        const header = ['year', ...codesToShow.flatMap(c => [`${c}_baseline`, `${c}_scenario`, `${c}_delta%`])];
        lines.push(header.join('\t'));

        for (let i = 0; i < baseRows.length; i++) {
            const baseRow = baseRows[i];
            const scenRow = scenarioRows[i];
            const cols = [baseRow.year];
            for (const code of codesToShow) {
                const base = baseRow.countries?.[code];
                const scen = scenRow?.countries?.[code];
                const fmt  = v => v == null ? 'N/A' : unit === 'trillions' ? gdpTrillions(v) : v;
                const delta = base && scen ? (((scen - base) / base) * 100).toFixed(2) + '%' : 'N/A';
                cols.push(fmt(base), fmt(scen), delta);
            }
            lines.push(cols.join('\t'));
        }

        return {
            content: [{ type: 'text', text: lines.join('\n') }],
        };
    }
);

// ── Tool: compare_countries ──────────────────────────────────────────────────
server.tool(
    'compare_countries',
    'Compare GDP trajectories between countries, optionally with a scenario overlay. Good for "when does X overtake Y" questions.',
    {
        countries: z.string().describe('Comma-separated country codes to compare (e.g. "USA,CHN,IND")'),
        from_year: z.number().int().min(1990).max(2100).default(2020),
        to_year:   z.number().int().min(1990).max(2100).default(2075),
        scenario_id: z.string().optional().describe('Optional scenario ID to overlay'),
        start_year:  z.number().int().min(2026).max(2080).optional()
            .describe('Scenario shock start year (required if scenario_id set)'),
        unit: z.enum(['trillions', 'raw']).default('trillions'),
    },
    async ({ countries: codesStr, from_year, to_year, scenario_id, start_year, unit }) => {
        const codes = codesStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const baseRows = pickYears(TIMELINE, from_year, to_year);

        let scenRows = null;
        let scenName = null;
        if (scenario_id) {
            const sc = policies.find(s => s.id === scenario_id);
            if (!sc) {
                return { content: [{ type: 'text', text: `Unknown scenario: ${scenario_id}` }] };
            }
            const sy = start_year ?? 2026;
            scenRows = pickYears(buildScenario(countries, sc, sy, 'default', null), from_year, to_year);
            scenName = sc.name;
        }

        const fmt = v => v == null ? 'N/A' : unit === 'trillions' ? gdpTrillions(v) : v;
        const colHeaders = scenRows
            ? codes.flatMap(c => [`${c}`, `${c}(${scenName})`])
            : codes;
        const lines = [`year\t${colHeaders.join('\t')}`];

        for (let i = 0; i < baseRows.length; i++) {
            const base = baseRows[i];
            const scen = scenRows?.[i];
            const cols = [base.year, ...codes.flatMap(c => {
                const bv = fmt(base.countries?.[c]);
                return scen ? [bv, fmt(scen.countries?.[c])] : [bv];
            })];
            lines.push(cols.join('\t'));
        }

        // Detect overtake events
        const overtakes = [];
        for (let ci = 0; ci < codes.length; ci++) {
            for (let cj = ci + 1; cj < codes.length; cj++) {
                const a = codes[ci], b = codes[cj];
                for (let i = 1; i < baseRows.length; i++) {
                    const prev = baseRows[i - 1];
                    const curr = baseRows[i];
                    const pa = prev.countries?.[a], pb = prev.countries?.[b];
                    const ca = curr.countries?.[a], cb = curr.countries?.[b];
                    if (pa != null && pb != null && ca != null && cb != null) {
                        if (pb > pa && cb <= ca) overtakes.push(`${a} overtakes ${b} around ${curr.year}`);
                        if (pa > pb && ca <= cb) overtakes.push(`${b} overtakes ${a} around ${curr.year}`);
                    }
                }
            }
        }

        const unitLabel = unit === 'trillions' ? 'USD trillions (nominal)' : 'USD (nominal)';
        let text = `GDP comparison — ${unitLabel}\n\n${lines.join('\n')}`;
        if (overtakes.length) text += `\n\nOvertake events detected:\n${overtakes.map(o => `• ${o}`).join('\n')}`;

        return { content: [{ type: 'text', text }] };
    }
);

// ── Tool: get_regional_summary ───────────────────────────────────────────────
server.tool(
    'get_regional_summary',
    'Get total GDP by world region for a given year, showing regional economic weights.',
    {
        year: z.number().int().min(1990).max(2100).default(2050),
        unit: z.enum(['trillions', 'raw']).default('trillions'),
    },
    async ({ year, unit }) => {
        const row = TIMELINE.find(r => r.year === year);
        if (!row) return { content: [{ type: 'text', text: `No data for year ${year}.` }] };

        const regionTotals = {};
        for (const c of countries) {
            const val = row.countries?.[c.code];
            if (val == null || !c.region) continue;
            regionTotals[c.region] = (regionTotals[c.region] ?? 0) + val;
        }

        const total = Object.values(regionTotals).reduce((s, v) => s + v, 0);
        const fmt   = v => unit === 'trillions' ? gdpTrillions(v) : v;

        const sorted = Object.entries(regionTotals).sort(([, a], [, b]) => b - a);
        const lines  = sorted.map(([region, val]) =>
            `${region.padEnd(28)} $${fmt(val)}T   (${((val / total) * 100).toFixed(1)}%)`
        );
        lines.push('');
        lines.push(`${'World total'.padEnd(28)} $${fmt(total)}T`);

        return {
            content: [{
                type: 'text',
                text: `Regional GDP summary — ${year} (nominal USD)\n\n${lines.join('\n')}`,
            }],
        };
    }
);

// ── Start ────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log to stderr so it doesn't interfere with stdio MCP protocol on stdout
    process.stderr.write('Data ISC MCP server running (stdio)\n');
}

main().catch(err => {
    process.stderr.write(`MCP server error: ${err.message}\n`);
    process.exit(1);
});
