/*
 * embed.js — <economic-sandbox-widget> custom element
 * ----------------------------------------------------
 * A single, dependency-free Web Component that lets anyone drop a live
 * Data ISC into a blog, Notion page, Substack or BI dashboard:
 *
 *   <script src="https://your-host/embed.js" async></script>
 *   <economic-sandbox-widget scenario="POLICY_001" start="2030"></economic-sandbox-widget>
 *
 * The widget renders the host app in clean "embed" mode inside an iframe, so
 * the proprietary economic model never leaves the server — every embed simply
 * points back to the host that served this script.
 *
 * Attributes (all optional, all reactive):
 *   scenario  Comma-separated scenario id(s), e.g. "POLICY_001" or "POLICY_001,POLICY_007"
 *   start     Scenario start year (2026–2080). Default 2030.
 *   view      Initial view: map | chart | race | table. Default map.
 *   year      Timeline year to focus. Default 2030.
 *   width     CSS width (e.g. "100%", "640px", "640"). Default 100%.
 *   height    CSS height (e.g. "520px", "520"). Default 520px.
 *   base      Override the host base URL (advanced; defaults to the directory
 *             embed.js was served from, so subpath deploys work too).
 */
(function () {
    'use strict';

    if (typeof window === 'undefined' || !('customElements' in window)) return;

    // ── Resolve the host origin from this script's own src, so the widget
    //    points back to the server that served it even on third-party pages.
    var THIS_SCRIPT = document.currentScript || (function () {
        var s = document.getElementsByTagName('script');
        return s[s.length - 1];
    })();
    // Resolve the directory embed.js was served from (origin + path, minus the
    // filename) so subpath deploys — e.g. https://user.github.io/data-isc/ —
    // resolve the app entry correctly, not just root-domain hosting.
    var HOST_BASE = (function () {
        try {
            var u = new URL(THIS_SCRIPT.src);
            return u.origin + u.pathname.replace(/[^/]*$/, '');
        } catch (_) { return location.origin + '/'; }
    })();

    // App entry (relative to HOST_BASE) that understands ?embed=1 + share-hash.
    var APP_FILE = 'index.html';

    function cssLen(v) {
        v = String(v == null ? '' : v).trim();
        return /^\d+(\.\d+)?$/.test(v) ? v + 'px' : v;
    }

    function attrOr(el, name, fallback) {
        var v = el.getAttribute(name);
        return (v === null || v === '') ? fallback : v;
    }

    var EconomicSandboxWidget = (function () {
        function W() {
            var self = Reflect.construct(HTMLElement, [], W);
            self.attachShadow({ mode: 'open' });
            return self;
        }
        W.prototype = Object.create(HTMLElement.prototype);
        W.prototype.constructor = W;
        Object.setPrototypeOf(W, HTMLElement);

        Object.defineProperty(W, 'observedAttributes', {
            get: function () {
                return ['scenario', 'start', 'view', 'year', 'width', 'height', 'base'];
            }
        });

        W.prototype.connectedCallback = function () { this._render(); };
        W.prototype.attributeChangedCallback = function () {
            if (this.isConnected) this._render();
        };

        W.prototype._buildSrc = function () {
            var base = attrOr(this, 'base', HOST_BASE) || (location.origin + '/');
            if (base.slice(-1) !== '/') base += '/';
            var hash = new URLSearchParams();
            hash.set('v', '1');
            hash.set('view', attrOr(this, 'view', 'map'));
            hash.set('year', attrOr(this, 'year', '2030'));
            var sc = this.getAttribute('scenario');
            if (sc) {
                hash.set('sc', sc.split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(','));
                hash.set('scy', attrOr(this, 'start', '2030'));
            }
            hash.set('mode', 'gdp');
            // embed flag lives in the query string (read from location.search by the host app)
            return base + APP_FILE + '?embed=1#' + hash.toString();
        };

        W.prototype._render = function () {
            var width = cssLen(attrOr(this, 'width', '100%'));
            var height = cssLen(attrOr(this, 'height', '520px'));
            var src = this._buildSrc();
            // textContent assignment via DOM keeps the src safely attribute-encoded
            this.shadowRoot.innerHTML =
                '<style>' +
                ':host{display:block;width:' + width + ';max-width:100%;}' +
                'iframe{display:block;width:100%;height:' + height + ';border:1px solid #1e293b;' +
                'border-radius:8px;background:#0a1020;}' +
                '</style>' +
                '<iframe loading="lazy" frameborder="0" allowfullscreen ' +
                'title="Data ISC"></iframe>';
            this.shadowRoot.querySelector('iframe').setAttribute('src', src);
        };

        return W;
    })();

    if (!customElements.get('economic-sandbox-widget')) {
        customElements.define('economic-sandbox-widget', EconomicSandboxWidget);
    }
})();
