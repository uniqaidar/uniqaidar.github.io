// functions/sitemap-xml.js
// Serves at route /sitemap-xml (clean URL, no dot in filename)
// _redirects maps  /sitemap.xml  →  /sitemap-xml  with a 200 rewrite
// so Googlebot fetching /sitemap.xml gets this Function's response.

const BASE_URL       = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL = `${BASE_URL}/fonts.json`;

let _cache          = null;
let _loadingPromise = null;

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

function escXml(str) {
    return (str || '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&apos;');
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

async function buildSitemapXml(context) {
    if (_cache) return _cache.xml;
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = (async () => {
        try {
            const [fontsText, html] = await Promise.all([
                fetchAsset(context, FONTS_JSON_URL),
                fetchAsset(context, `${BASE_URL}/`),
            ]);

            let fonts = [];
            if (fontsText) {
                try {
                    const parsed = JSON.parse(fontsText);
                    if (Array.isArray(parsed)) fonts = parsed;
                } catch (_) {}
            }

            const catIds = [];
            if (html) {
                const rx = /<button class="filter-btn" onclick="filterFonts\('([^']+)',\s*this\)">([^<]+)<\/button>/g;
                let m;
                while ((m = rx.exec(html)) !== null) {
                    catIds.push(m[1]);
                }
            }

            const dateToday = today();
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

            if (fonts.length > 0) {
                lines.push('  <!-- Individual Font Pages -->');
                for (const font of fonts) {
                    const name = font.name || '';
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

export async function onRequestGet(context) {
    const xml = await buildSitemapXml(context);
    if (!xml) return context.next();

    return new Response(xml, {
        status: 200,
        headers: {
            'Content-Type':               'application/xml; charset=utf-8',
            'Cache-Control':              'public, max-age=3600',
            'X-Robots-Tag':               'all',
            'Access-Control-Allow-Origin': '*',
        }
    });
}
