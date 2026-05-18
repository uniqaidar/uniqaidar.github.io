// functions/sitemap-index-xml.js
// Serves at route /sitemap-index-xml (clean URL, no dot in filename)
// _redirects maps  /sitemap_index.xml  →  /sitemap-index-xml  with a 200 rewrite

const BASE_URL = 'https://uniqaidar.pages.dev';

function today() {
    return new Date().toISOString().slice(0, 10);
}

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
            'Content-Type':               'application/xml; charset=utf-8',
            'Cache-Control':              'public, max-age=3600',
            'X-Robots-Tag':               'all',
            'Access-Control-Allow-Origin': '*',
        }
    });
}
