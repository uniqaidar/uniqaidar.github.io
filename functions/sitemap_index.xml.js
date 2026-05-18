// functions/sitemap_index.xml.js
// Dynamically generates sitemap_index.xml at runtime.
// Serves to ALL requests including Googlebot — bypasses the Cloudflare
// infrastructure 403 that blocks static file fetches on *.pages.dev.
//
// PLACE THIS FILE AT: functions/sitemap_index.xml.js

const BASE_URL = 'https://uniqaidar.pages.dev';

// ── Today's date as YYYY-MM-DD ──────────────────────────────────────────────────
function today() {
    return new Date().toISOString().slice(0, 10);
}

// ── Request handler ─────────────────────────────────────────────────────────────
export async function onRequestGet(context) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap.xml</loc>
    <lastmod>${today()}</lastmod>
  </sitemap>
</sitemapindex>`;

    return new Response(xml, {
        status: 200,
        headers: {
            'Content-Type':   'application/xml; charset=utf-8',
            'Cache-Control':  'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'X-Frame-Options': 'SAMEORIGIN',
        }
    });
}
