/**
 * schema-analyzer.js
 * Stateless schema detection — runs once when data changes, never inside render loops.
 * Exports: window.analyzeSchema(columns, data) → SchemaResult
 */
(function (global) {
    'use strict';

    // Term sets for each signal type
    const GEO_TERMS  = ['country','nation','state','province','region','territory',
                         'iso','iso2','iso3','isocode','countrycode','geoid',
                         'lat','latitude','lng','lon','longitude'];
    const TIME_TERMS = ['year','date','timestamp','quarter','month','week',
                         'period','time','datetime','fiscal','yr','dy','wk'];
    const CAT_TERMS  = ['category','name','label','type','item','product','group',
                         'class','kind','segment','sector','industry','department',
                         'brand','tag','status','source','origin','channel'];
    const SKIP_VAL   = ['id','index','idx','rank','row','seq','no','num',
                         'order','pos','position','key','code'];

    // Strict date pattern: MUST contain dashes so bare integers (1040, 2020, etc.) never match.
    // Plain year integers are detected via column-name matching only (TIME_TERMS includes 'year').
    const ISO_DATE_RE = /^(19|20|21)\d{2}-\d{2}(-\d{2})?$/;
    const MONETARY_RE = /\b(gdp|gnp|revenue|income|salary|wages?|cost|price|budget|expenditure|spend|usd|eur|gbp|cny|inr|jpy|brl|monetary|financial|market|sales|profit|loss|tax|debt|deficit|surplus|turnover|cash|fund|capital|wealth|asset|earning|amount|value|dollar|euro|pound|yen|franc|currency)\b|\$|€|£|¥|₹/i;

    // Normalise a column name for keyword matching
    function norm(s) {
        return String(s ?? '').toLowerCase().replace(/[\s\-_./()[\]]/g, '');
    }

    function hits(key, terms) {
        const k = norm(key);
        return terms.some(t => k === t || k.includes(t));
    }

    function inferType(colName, sample) {
        const key     = norm(colName);
        const nonEmpty = sample.filter(v => v !== null && v !== undefined && v !== '');

        // 1. Column-name signals take priority
        if (hits(key, GEO_TERMS))  return 'geo';
        if (hits(key, TIME_TERMS)) return 'time';

        // 2. Numeric detection before date — avoids misclassifying large integers as dates
        if (nonEmpty.length > 0) {
            const numCount = nonEmpty.filter(v => {
                const s = String(v).replace(/[,$%\s]/g, '');
                return s !== '' && !isNaN(parseFloat(s));
            }).length;
            if (numCount >= nonEmpty.length * 0.7) {
                return hits(key, SKIP_VAL) ? 'id' : 'numeric';
            }
        }

        // 3. Value-based temporal detection — only fires for dash-formatted dates (YYYY-MM-DD / YYYY-MM)
        //    Plain integers like 2020 are handled by column-name matching above.
        if (nonEmpty.length >= 2) {
            const dateHits = nonEmpty.filter(v => ISO_DATE_RE.test(String(v).trim())).length;
            if (dateHits >= nonEmpty.length * 0.7) return 'time';
        }

        return hits(key, CAT_TERMS) ? 'category' : 'string';
    }

    /**
     * analyzeSchema(columns, data) → SchemaResult
     *
     * SchemaResult shape:
     * {
     *   signals:         { geographic, temporal, categorical }  — boolean flags
     *   keys:            { geo, time, category, value, valueKeys }
     *   charts:          string[]   — ordered by confidence; 'table' always last
     *   primaryChart:    string     — charts[0]
     *   uniqueCategories: number
     *   rowCount:        number
     *   columnCount:     number
     *   isMonetary:      boolean
     *   _classified:     { original, type }[]  — per-column type map (internal)
     * }
     */
    function analyzeSchema(columns, data) {
        if (!columns.length || !data.length) {
            return {
                signals: { geographic: false, temporal: false, categorical: false },
                keys: { geo: null, time: null, category: null, value: null, valueKeys: [] },
                charts: ['table'], primaryChart: 'table',
                uniqueCategories: 0, rowCount: 0, columnCount: 0, isMonetary: false,
                _classified: [],
            };
        }

        const sample = data.slice(0, Math.min(60, data.length));

        const cls = columns.map(col => ({
            original: col,
            type: inferType(col, sample.map(r => r[col])),
        }));

        const geoCol   = cls.find(c => c.type === 'geo');
        const timeCol  = cls.find(c => c.type === 'time');
        const numCols  = cls.filter(c => c.type === 'numeric');

        // Best categorical column: explicit category keyword, else first non-geo string
        const catCol = cls.find(c => c.type === 'category')
                    || cls.find(c => c.type === 'string' && c.original !== geoCol?.original);

        // Value columns: numeric columns that aren't id-like
        const valueCols = numCols.filter(c => !hits(c.original, SKIP_VAL));
        const valueCol  = valueCols[0] ?? null;

        // Unique-category count: use catCol (preferred) or geoCol as the group axis
        const groupCol = catCol || geoCol;
        const uniqueCategories = groupCol
            ? new Set(data.map(r => r[groupCol.original]).filter(v => v != null && v !== '')).size
            : 0;

        const geographic  = !!geoCol;
        const temporal    = !!timeCol;
        const categorical = !!(catCol && valueCols.length > 0);

        // Build ordered chart list — only include types that have the required keys
        const charts = [];
        if (temporal && valueCol)                               charts.push('line');
        if (categorical && uniqueCategories <= 6 && valueCol)  charts.push('donut');
        if ((categorical || geographic) && valueCol)            charts.push('bar');
        charts.push('table');   // always available as fallback

        return {
            signals:          { geographic, temporal, categorical },
            keys: {
                geo:       geoCol?.original   ?? null,
                time:      timeCol?.original  ?? null,
                category:  catCol?.original   ?? null,
                value:     valueCol?.original ?? null,
                valueKeys: valueCols.map(c => c.original),
            },
            charts,
            primaryChart:     charts[0],
            uniqueCategories,
            rowCount:         data.length,
            columnCount:      columns.length,
            isMonetary:       MONETARY_RE.test(columns.join(' ').replace(/[_\-]/g, ' ')),
            _classified:      cls,
        };
    }

    global.analyzeSchema = analyzeSchema;

})(window);
