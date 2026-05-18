// functions/[[path]].js
// Catch-all Cloudflare Pages Function.
// Intercepts /sitemap.xml and /sitemap_index.xml for ALL requests
// (Googlebot, Bingbot, Google Search Console fetch tool, humans).
// All other requests pass through via context.next() — zero cost.

const BASE_URL       = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL = `${BASE_URL}/fonts.json`;

async function fetchAsset(context, url) {
    if (context.env && context.env.ASSETS) {
        try {
            const res = await context.env.ASSETS.fetch(new Request(url));
            if (res.ok) return res.text();
        } catch (_) {}
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'UniQaidar-Render/1.0' } });
    return res.ok ? res.text() : '';
}

function escXml(str) {
    return (str || '')
        .replace(/&/g,  '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function buildSitemapXml(context) {
    const dateToday = new Date().toISOString().slice(0, 10);
    let fonts = [];
    try {
        const txt = await fetchAsset(context, FONTS_JSON_URL);
        if (txt) { const p = JSON.parse(txt); if (Array.isArray(p)) fonts = p; }
    } catch (_) {}
    let catIds = [];
    try {
        const html = await fetchAsset(context, `${BASE_URL}/`);
        if (html) {
            const rx = /<button class="filter-btn" onclick="filterFonts\('([^']+)',\s*this\)">/g;
            let m;
            while ((m = rx.exec(html)) !== null) catIds.push(m[1]);
        }
    } catch (_) {}
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '',
        '  <!-- Home Page -->',
        '  <url>',
        `    <loc>${BASE_URL}/</loc>`,
        `    <lastmod>${dateToday}</lastmod>`,
        '    <changefreq>daily</changefreq>',
        '    <priority>1.00</priority>',
        '  </url>',
        '',
    ];
    if (catIds.length > 0) {
        lines.push('  <!-- Category Pages -->');
        for (const cat of catIds) {
            lines.push('  <url>');
            lines.push(`    <loc>${escXml(`${BASE_URL}/?cat=${encodeURIComponent(cat)}`)}</loc>`);
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
            if (!font.name) continue;
            const firstCat = (font.category && font.category[0]) || 'All';
            const loc = `${BASE_URL}/?cat=${encodeURIComponent(firstCat)}&font=${encodeURIComponent(font.name)}`;
            lines.push('  <url>');
            lines.push(`    <loc>${escXml(loc)}</loc>`);
            lines.push(`    <lastmod>${escXml(font.dateAdded || dateToday)}</lastmod>`);
            lines.push('    <changefreq>monthly</changefreq>');
            lines.push('    <priority>0.70</priority>');
            lines.push('  </url>');
        }
    }
    lines.push('', '</urlset>');
    return lines.join('\n');
}

const SITEMAP_HEADERS = {
    'Content-Type':                 'application/xml; charset=utf-8',
    'Cache-Control':                'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control':            'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Surrogate-Control':            'no-store',
    'X-Robots-Tag':                 'all',
    'Access-Control-Allow-Origin':  '*',
    'Vary':                         'Accept-Encoding',
};

export async function onRequest(context) {
    const pathname = new URL(context.request.url).pathname;
    if (pathname === '/sitemap.xml') {
        const xml = await buildSitemapXml(context);
        return new Response(xml, { status: 200, headers: SITEMAP_HEADERS });
    }
    if (pathname === '/sitemap_index.xml') {
        const today = new Date().toISOString().slice(0, 10);
        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            '  <sitemap>',
            `    <loc>${BASE_URL}/sitemap.xml</loc>`,
            `    <lastmod>${today}</lastmod>`,
            '  </sitemap>',
            '</sitemapindex>',
        ].join('\n');
        return new Response(xml, { status: 200, headers: SITEMAP_HEADERS });
    }
    return context.next();
}
