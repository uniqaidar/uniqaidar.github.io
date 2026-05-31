// functions/[[path]].js
// Catch-all Cloudflare Pages Function.
//
// ROLE 1 — Sitemap generation (all visitors):
//   Intercepts /sitemap.xml and /sitemap_index.xml and serves dynamic XML.
//
// ROLE 2 — SSR for crawlers (?font= and ?cat= pages):
//   Serves fully server-rendered HTML with unique meta tags per font or category.
//   Human visitors are passed through unchanged via context.next() — zero cost.
//
// ROLE 3 — Canonical injection for crawlers (homepage / passthrough pages):
//   Injects dynamic canonical tags into HTML responses for proper SEO.
//   Preserves SSR-written canonicals — never overwrites them.
//
// NEW FONTS:      zero code change needed — reads fonts.json dynamically.
// NEW CATEGORIES: zero code change needed — reads labels from index.html buttons.

const BASE_URL         = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL   = `${BASE_URL}/fonts.json`;
const POPULAR_JSON_URL = `${BASE_URL}/popular.json`;

// ── Module-level caches (persist for the lifetime of the worker instance) ─────
let _fontsCache     = null; // parsed fonts array
let _catCache       = null; // { catId → Kurdish label }
let _paraDefault    = null; // DEFAULT_PARA_TEXT from index.html
let _popularCache   = null; // ordered array of font names from popular.json
let _loadingPromise = null; // prevents duplicate fetches on cold start

// ── Asset fetcher: ASSETS binding first (internal, free), fetch() fallback ────
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

// ── Load all data in parallel, once per worker instance ──────────────────────
async function loadData(context) {
    if (_fontsCache && _catCache && _paraDefault && _popularCache) {
        return { fonts: _fontsCache, catNames: _catCache, paraDefault: _paraDefault, popular: _popularCache };
    }
    if (_loadingPromise) return _loadingPromise;

    _loadingPromise = (async () => {
        try {
            // Fetch fonts.json, index.html, and popular.json IN PARALLEL
            const [fontsText, html, popularText] = await Promise.all([
                fetchAsset(context, FONTS_JSON_URL),
                fetchAsset(context, `${BASE_URL}/`),
                fetchAsset(context, POPULAR_JSON_URL),
            ]);

            // Parse fonts.json
            if (fontsText) {
                const parsed = JSON.parse(fontsText);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    _fontsCache = parsed;
                }
            }

            // Parse popular.json
            if (popularText) {
                const parsed = JSON.parse(popularText);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    _popularCache = parsed; // ordered array of font names
                }
            }

            // Extract from index.html:
            _catCache    = {};
            _paraDefault = 'فۆنتەکانی یونی قەیدار'; // safe fallback
            if (html) {
                // 1. Category labels from filter buttons (same regex as admin.html parseCats())
                const rxCat = /<button class="filter-btn" onclick="filterFonts\('([^']+)',\s*this\)">([^<]+)<\/button>/g;
                let m;
                while ((m = rxCat.exec(html)) !== null) {
                    _catCache[m[1]] = m[2].trim();
                }

                // 2. DEFAULT_PARA_TEXT — exact value from index.html
                const paraMatch = html.match(/var DEFAULT_PARA_TEXT\s*=\s*'([^']+)'/);
                if (paraMatch) _paraDefault = paraMatch[1];
            }
        } catch (_) {
            // Fetch failed — caches stay null, function falls through gracefully
        } finally {
            _loadingPromise = null;
        }
        return {
            fonts:       _fontsCache  || [],
            catNames:    _catCache    || {},
            paraDefault: _paraDefault || 'فۆنتەکانی یونی قەیدار',
            popular:     _popularCache || [],
        };
    })();

    return _loadingPromise;
}

// ── SEO crawler detection ─────────────────────────────────────────────────────
// Excludes social bots (WhatsApp, Telegram, Facebook, Twitter, LinkedIn) —
// those fire on every user share and would burn the 100k/day limit.
function isCrawler(ua) {
    if (!ua) return false;
    const s = ua.toLowerCase();
    return (
        s.includes('googlebot')             ||
        s.includes('google-inspectiontool') ||
        s.includes('bingbot')               ||
        s.includes('yandex')                ||
        s.includes('baiduspider')           ||
        s.includes('duckduckbot')           ||
        s.includes('slurp')
    );
}

// ── HTML attribute escaping ───────────────────────────────────────────────────
function escHtml(str) {
    return (str || '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;');
}

// ── XML escaping (for sitemap) ────────────────────────────────────────────────
function escXml(str) {
    return (str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── JSON string escaping (for JSON-LD blocks only) ────────────────────────────
function jsonSafe(str) {
    return (str || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g,  '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

// ── Safe Unicode-aware truncation ─────────────────────────────────────────────
function truncate(str, maxLen) {
    if (!str) return '';
    return [...str].slice(0, maxLen).join('');
}

// ── Build SEO meta block to inject into real index.html ──────────────────────
function buildFontMeta(font, catNames, paraDefault) {
    const name       = font.name     || '';
    const path       = font.path     || `UniQaidarFonts/${name}.ttf`;
    const preview    = font.preview  || 'فۆنتەکانی یونی‌قەیدار';
    const paragraph  = (font.paragraph && font.paragraph.trim())
                           ? font.paragraph.trim()
                           : paraDefault;
    const dateAdded  = font.dateAdded || '';
    const size       = font.size     || '';
    const allCats    = font.category || [];
    const firstCat   = allCats[0]    || 'All';

    const fontUrl  = `${BASE_URL}/?cat=${encodeURIComponent(firstCat)}&font=${encodeURIComponent(name)}`;
    const ttfUrl   = `${BASE_URL}/${path}`;
    const logoUrl  = `${BASE_URL}/api/og?type=font&name=${encodeURIComponent(name)}`;
    const metaDesc = truncate(`${preview} — ${paragraph}`, 155);
    const catKeywords = allCats.map(c => catNames[c] || c).join(', ');

    const title = `${escHtml(name)} - داگرتنی فۆنتی کوردی | UniQaidar`;
    const desc  = `${escHtml(metaDesc)} — فۆنتەکانی یونی‌قەیدار Kurdish Font.`;

    const jName = jsonSafe(name);
    const jUrl  = jsonSafe(fontUrl);
    const jDesc = jsonSafe(`${preview} — ${paragraph}`);
    const jDate = jsonSafe(dateAdded);
    const jSize = jsonSafe(size);
    const jPath = jsonSafe(ttfUrl);

    return {
        title,
        canonical: escHtml(fontUrl),
        meta: `<meta name="description" content="${desc}">
<meta name="keywords" content="${escHtml(name)}, ${escHtml(catKeywords)}, فۆنتی کوردی, Kurdish Font, UniQaidar, یونی‌قەیدار">
<meta name="robots" content="index, follow">
<meta name="author" content="Qaidar Rahim">
<meta property="og:type" content="website">
<meta property="og:site_name" content="UniQaidar Fonts — فۆنتەکانی یونی‌قەیدار">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escHtml(fontUrl)}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="UniQaidar Fonts - Kurdish &amp; Arabic Font Library">
<meta property="og:locale" content="ckb_IQ">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Qaidar_Rahim">
<meta name="twitter:creator" content="@Qaidar_Rahim">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${logoUrl}">
<meta name="geo.region" content="IQ-SU">
<meta name="geo.placename" content="Sulaymaniyah, Kurdistan Region, Iraq">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "${jName}",
  "url": "${jUrl}",
  "downloadUrl": "${jPath}",
  "applicationCategory": "UtilitiesApplication",
  "operatingSystem": "Web, Windows, macOS, Android, iOS",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "${jDesc}",
  "author": { "@type": "Person", "name": "Qaidar Rahim", "sameAs": "https://twitter.com/Qaidar_Rahim" },
  "datePublished": "${jDate}",
  "fileSize": "${jSize}",
  "inLanguage": ["ckb", "ar"]
}
<\/script>`,
    };
}

function buildCatMeta(cat, count, catNames) {
    const catLabel = catNames[cat] || cat;
    const catUrl   = `${BASE_URL}/?cat=${encodeURIComponent(cat)}`;
    const logoUrl  = `${BASE_URL}/api/og?type=cat&cat=${encodeURIComponent(cat)}`;

    const title = `${escHtml(catLabel)} - فۆنتی کوردی | UniQaidar`;
    const desc  = `${count} فۆنتی کوردی بە خۆڕایی لە بەشی ${escHtml(catLabel)}. دابەزاندن و تاقیکردنەوەی فۆنتەکانی یونی‌قەیدار — ${count} free Kurdish fonts.`;

    const jLabel = jsonSafe(catLabel);
    const jUrl   = jsonSafe(catUrl);
    const jDesc  = jsonSafe(`${count} فۆنتی کوردی بە خۆڕایی لە بەشی ${catLabel}. فۆنتەکانی یونی‌قەیدار — ${count} free Kurdish fonts.`);

    return {
        title,
        canonical: escHtml(catUrl),
        meta: `<meta name="description" content="${desc}">
<meta name="robots" content="index, follow">
<meta name="author" content="Qaidar Rahim">
<meta property="og:type" content="website">
<meta property="og:site_name" content="UniQaidar Fonts — فۆنتەکانی یونی‌قەیدار">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escHtml(catUrl)}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="UniQaidar Fonts - Kurdish &amp; Arabic Font Library">
<meta property="og:locale" content="ckb_IQ">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Qaidar_Rahim">
<meta name="twitter:creator" content="@Qaidar_Rahim">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${logoUrl}">
<meta name="geo.region" content="IQ-SU">
<meta name="geo.placename" content="Sulaymaniyah, Kurdistan Region, Iraq">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "${jLabel} — UniQaidar Kurdish Fonts",
  "url": "${jUrl}",
  "description": "${jDesc}",
  "author": { "@type": "Person", "name": "Qaidar Rahim", "sameAs": "https://twitter.com/Qaidar_Rahim" },
  "numberOfItems": ${count}
}
<\/script>`,
    };
}

// ── Inject SEO meta into real index.html ──────────────────────────────────────
// Fetches the real index.html (same page humans see), replaces the generic
// <title>, <meta name="description">, <link rel="canonical"> and all og/twitter
// tags with font- or category-specific values, and returns the full page.
// Googlebot sees the exact same design as human visitors.
async function injectSeoMeta(context, seo) {
    let html;
    try {
        html = await fetchAsset(context, `${BASE_URL}/`);
    } catch (_) {
        return null;
    }
    if (!html) return null;

    // 1. Replace <title>
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${seo.title}</title>`);

    // 2. Replace canonical
    html = html.replace(
        /<link\s+rel="canonical"[^>]*>/gi,
        `<link rel="canonical" href="${seo.canonical}">`
    );

    // 3. Remove all existing meta tags we will replace:
    //    description, keywords, robots, author, og:*, twitter:*, geo.*
    //    and any existing JSON-LD script blocks
    html = html.replace(/<meta\s+name="description"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="keywords"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="robots"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="author"[^>]*>/gi, '');
    html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="geo\.[^"]*"[^>]*>/gi, '');
    html = html.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');

    // 4. Inject all new meta + JSON-LD right before </head>
    html = html.replace('</head>', `${seo.meta}\n</head>`);

    return html;
}

// ── Sitemap builder ───────────────────────────────────────────────────────────
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

// ── Inject dynamic canonical into HTML responses ───────────────────────────────
async function injectCanonical(response, requestUrl) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
        return response;
    }

    try {
        let html = await response.text();

        // If SSR already wrote a canonical (all ?font= and ?cat= pages),
        // preserve it exactly — do not overwrite with the raw request URL which
        // may be missing ?cat= and would create a canonical mismatch for Google.
        if (/<link\s+rel="canonical"[^>]*href="[^"]*\?[^"]*"/i.test(html)) {
            return new Response(html, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }

        // No query-bearing canonical in the HTML (homepage / passthrough pages).
        // Build one from the request URL and inject it.
        const parsedUrl = new URL(requestUrl);
        const canonicalUrl = parsedUrl.origin + parsedUrl.pathname + parsedUrl.search;

        // Escape for HTML attributes
        const escapedCanonical = canonicalUrl
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Replace the existing canonical tag (handles both dynamic and static versions)
        // Matches: <link rel="canonical" href="..."> or <link rel="canonical" id="dynamic-canonical" href="...">
        html = html.replace(
            /<link\s+rel="canonical"[^>]*>/gi,
            `<link rel="canonical" href="${escapedCanonical}">`
        );

        // Homepage og:image — replace Logo.png with dynamic home og image
        // Only fires for the homepage (no query params) — crawlers only reach here for homepage
        if (!parsedUrl.search) {
            const homeOgUrl = `${BASE_URL}/api/og?type=home`;
            html = html.replace(
                /(<meta\s+property="og:image"\s+content=")[^"]*(")/gi,
                `$1${homeOgUrl}$2`
            );
            html = html.replace(
                /(<meta\s+property="og:image:width"\s+content=")[^"]*(")/gi,
                '$11200$2'
            );
            html = html.replace(
                /(<meta\s+property="og:image:height"\s+content=")[^"]*(")/gi,
                '$1630$2'
            );
            html = html.replace(
                /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/gi,
                `$1${homeOgUrl}$2`
            );
        }

        return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    } catch (_) {
        // If injection fails, return original response
        return response;
    }
}

// ── Main request handler ──────────────────────────────────────────────────────
export async function onRequest(context) {
    const url      = new URL(context.request.url);
    const pathname = url.pathname;
    const ua       = context.request.headers.get('User-Agent') || '';

    // ── ROLE 1: Sitemaps (all visitors) ──────────────────────────────────────
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

    // ── Humans pass through instantly — zero cost ─────────────────────────────
    if (!isCrawler(ua)) return context.next();

    // ── ROLE 2: SSR for crawlers (?font= and ?cat= pages) ────────────────────
    const fontParam = url.searchParams.get('font');
    const catParam  = url.searchParams.get('cat');

    if (fontParam || catParam) {
        let fonts, catNames, paraDefault, popular;
        try {
            ({ fonts, catNames, paraDefault, popular } = await loadData(context));
        } catch (_) {
            return context.next();
        }

        if (!Array.isArray(fonts) || fonts.length === 0) {
            return context.next();
        }

        // Font page — fontParam wins when both params present
        if (fontParam) {
            const font = fonts.find(f => f.name === fontParam);
            if (!font) return context.next();

            const seo  = buildFontMeta(font, catNames, paraDefault);
            const html = await injectSeoMeta(context, seo);
            if (!html) return context.next();

            return new Response(html, {
                status: 200,
                headers: {
                    'Content-Type':  'text/html; charset=utf-8',
                    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                    'X-Robots-Tag':  'index, follow',
                    'Vary':          'User-Agent',
                }
            });
        }

        // Category page
        // ?cat=All      → all fonts (mirrors filterFonts('All') in index.html)
        // ?cat=Trending → fonts from popular.json, in popular order
        if (catParam) {
            const catLower = catParam.toLowerCase();
            let catFonts;

            if (catLower === 'all') {
                catFonts = fonts;
            } else if (catLower === 'trending') {
                // Build a name→font map for O(1) lookup, then preserve popular.json order
                const fontMap = Object.fromEntries(fonts.map(f => [f.name, f]));
                catFonts = popular.map(name => fontMap[name]).filter(Boolean);
            } else {
                catFonts = fonts.filter(
                    f => Array.isArray(f.category) &&
                         f.category.some(c => c.toLowerCase() === catLower)
                );
            }

            if (!catFonts.length) return context.next();

            const seo  = buildCatMeta(catParam, catFonts.length, catNames);
            const html = await injectSeoMeta(context, seo);
            if (!html) return context.next();

            return new Response(html, {
                status: 200,
                headers: {
                    'Content-Type':  'text/html; charset=utf-8',
                    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                    'X-Robots-Tag':  'index, follow',
                    'Vary':          'User-Agent',
                }
            });
        }
    }

    // ── ROLE 3: Canonical injection for crawlers (homepage / other pages) ─────
    const response = await context.next();
    return injectCanonical(response, context.request.url);
}
