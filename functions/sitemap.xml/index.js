// functions/sitemap.xml/index.js          ← CORRECT path for Cloudflare Pages
//
// WHY THIS PATH:
//   Cloudflare Pages cannot route filenames that contain a dot in the stem
//   (e.g. "sitemap.xml.js").  The correct pattern for routes with dots is a
//   directory named after the route segment, with index.js inside it:
//
//       functions/sitemap.xml/index.js  →  serves  /sitemap.xml
//
//   The old file  functions/sitemap.xml.js  must be DELETED from the repo.
//
// Dynamically generates sitemap.xml at runtime by reading fonts.json and
// category buttons from index.html. Serves to ALL requests including
// Googlebot — bypasses the Cloudflare infrastructure 403 that blocks
// static file fetches from crawlers on *.pages.dev subdomains.
//
// AUTO-UPDATES when:
//   - New fonts are added to fonts.json
//   - New categories are added to index.html filter buttons
//   - Font dateAdded fields are updated
//   - Nothing else needed — zero maintenance

const BASE_URL       = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL = `${BASE_URL}/fonts.json`;

// ── Module-level cache (persists for the lifetime of the worker instance) ──────
let _cache          = null; // { xml, builtAt }
let _loadingPromise = null;

// ── Asset fetcher: ASSETS binding first (internal, free), fetch() fallback ─────
async function fetchAsset(context, url) {
    if (context.env && context.env.ASSETS) {
        try {
            const res = await context.env.ASSETS.fetch(new Request(url));
            if (res.ok) return res.text();
        } catch (_) { /* fall through */ }
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'UniQaidar-Render/1.0' } });
    return res.ok ? res.text() : '';
}

// ── XML attribute/text escaping ─────────────────────────────────────────────────
function escXml(str) {
    return (str || '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&apos;');
}

// ── Today's date as YYYY-MM-DD ──────────────────────────────────────────────────
function today() {
    return new Date().toISOString().slice(0, 10);
}

// ── Build the full sitemap XML dynamically ──────────────────────────────────────
async function buildSitemapXml(context) {
    if (_cache) return _cache.xml;
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = (async () => {
        try {
            // Fetch fonts.json and index.html in parallel
            const [fontsText, html] = await Promise.all([
                fetchAsset(context, FONTS_JSON_URL),
                fetchAsset(context, `${BASE_URL}/`),
            ]);

            // Parse fonts.json
            let fonts = [];
            if (fontsText) {
                try {
                    const parsed = JSON.parse(fontsText);
                    if (Array.isArray(parsed)) fonts = parsed;
                } catch (_) {}
            }

            // Extract category IDs from index.html filter buttons
            // Same regex as index.js — auto-picks up new categories
            const catIds = [];
            if (html) {
                const rx = /<button class="filter-btn" onclick="filterFonts\('([^']+)',\s*this\)">([^<]+)<\/button>/g;
                let m;
                while ((m = rx.exec(html)) !== null) {
                    catIds.push(m[1]);
                }
            }

            const dateToday = today();

            // ── Build XML ──────────────────────────────────────────────────────
            const lines = [];
            lines.push('<?xml version="1.0" encoding="UTF-8"?>');
            lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
            lines.push('');
            lines.push('  <!-- Home Page -->');
            lines.push('  <url>');
            lines.push(`    <loc>${BASE_URL}/</loc>`);
            lines.push(`    <lastmod>${dateToday}</lastmod>`);
            lines.push('    <changefreq>daily</changefreq>');
            lines.push('    <priority>1.00</priority>');
            lines.push('  </url>');
            lines.push('');

            // ── Category pages ─────────────────────────────────────────────────
            if (catIds.length > 0) {
                lines.push('  <!-- Category Pages -->');
                for (const cat of catIds) {
                    const loc = `${BASE_URL}/?cat=${encodeURIComponent(cat)}`;
                    lines.push('  <url>');
                    lines.push(`    <loc>${escXml(loc)}</loc>`);
                    lines.push(`    <lastmod>${dateToday}</lastmod>`);
                    lines.push('    <changefreq>weekly</changefreq>');
                    lines.push('    <priority>0.80</priority>');
                    lines.push('  </url>');
                }
                lines.push('');
            }

            // ── Individual font pages ──────────────────────────────────────────
            if (fonts.length > 0) {
                lines.push('  <!-- Individual Font Pages -->');
                for (const font of fonts) {
                    const name    = font.name || '';
                    if (!name) continue;
                    const firstCat = (font.category && font.category[0]) || 'All';
                    const loc      = `${BASE_URL}/?cat=${encodeURIComponent(firstCat)}&font=${encodeURIComponent(name)}`;
                    const lastmod  = font.dateAdded || dateToday;
                    lines.push('  <url>');
                    lines.push(`    <loc>${escXml(loc)}</loc>`);
                    lines.push(`    <lastmod>${escXml(lastmod)}</lastmod>`);
                    lines.push('    <changefreq>monthly</changefreq>');
                    lines.push('    <priority>0.70</priority>');
                    lines.push('  </url>');
                }
            }

            lines.push('');
            lines.push('</urlset>');

            const xml = lines.join('\n');
            _cache = { xml, builtAt: Date.now() };
            return xml;

        } catch (_) {
            return null;
        } finally {
            _loadingPromise = null;
        }
    })();

    return _loadingPromise;
}

// ── Request handler — serves to ALL requests, no crawler check ─────────────────
// This is intentional: the sitemap must be accessible to everyone including
// Googlebot, Bingbot, and Google Search Console's fetch tool.
export async function onRequestGet(context) {
    const xml = await buildSitemapXml(context);

    if (!xml) {
        // Fallback — pass through to static file if dynamic build failed
        return context.next();
    }

    return new Response(xml, {
        status: 200,
        headers: {
            'Content-Type':              'application/xml; charset=utf-8',
            'Cache-Control':             'public, max-age=3600',
            'X-Robots-Tag':              'all',
            'Access-Control-Allow-Origin': '*',
        }
    });
}
