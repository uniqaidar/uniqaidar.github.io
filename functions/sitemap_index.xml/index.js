// functions/sitemap_index.xml/index.js    ← CORRECT path for Cloudflare Pages
//
// WHY THIS PATH:
//   Cloudflare Pages cannot route filenames that contain a dot in the stem
//   (e.g. "sitemap_index.xml.js").  The correct pattern for routes with dots
//   is a directory named after the route segment, with index.js inside it:
//
//       functions/sitemap_index.xml/index.js  →  serves  /sitemap_index.xml
//
//   The old file  functions/sitemap_index.xml.js  must be DELETED from the repo.
//
// Dynamically generates sitemap_index.xml at runtime.
// Serves to ALL requests including Googlebot — bypasses the Cloudflare
// infrastructure 403 that blocks static file fetches on *.pages.dev.

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
            'Content-Type':              'application/xml; charset=utf-8',
            'Cache-Control':             'public, max-age=3600',
            'X-Robots-Tag':              'all',
            'Access-Control-Allow-Origin': '*',
        }
    });
}
