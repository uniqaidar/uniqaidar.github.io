// functions/index.js
// Intercepts GET / requests from SEO crawlers (Googlebot, Bingbot, Yandex, etc.)
// and serves a fully server-rendered HTML page with unique meta tags per font or category.
// Human visitors are passed through unchanged via context.next() — zero cost.
//
// PLACE THIS FILE AT: functions/index.js
// Do NOT place inside functions/api/ — that maps to /api/* routes, not /.
//
// NEW FONTS:      zero code change needed — reads fonts.json dynamically.
// NEW CATEGORIES: zero code change needed — reads labels from index.html buttons.
//
// FIELDS READ FROM fonts.json (every field, nothing omitted):
//   name        — font name (UniQAIDAR_...)
//   path        — TTF file path (UniQaidarFonts/...)
//   category    — array of category IDs
//   preview     — short preview text (all 436 fonts)
//   paragraph   — long paragraph text (13 fonts — rest use DEFAULT_PARA_TEXT)
//   lineHeight  — preview line height
//   dateAdded   — date font was added
//   size        — file size (e.g. "115 KB")
//
// DEFAULT_PARA_TEXT read from index.html (same value the real site uses).

const BASE_URL          = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL    = `${BASE_URL}/fonts.json`;
const POPULAR_JSON_URL  = `${BASE_URL}/popular.json`;

// ── Module-level caches (persist for the lifetime of the worker instance) ─────
let _fontsCache     = null; // parsed fonts array
let _catCache       = null; // { catId → Kurdish label }
let _paraDefault    = null; // DEFAULT_PARA_TEXT from index.html
let _popularCache   = null; // ordered array of font names from popular.json
let _loadingPromise = null; // prevents duplicate fetches on cold start

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
            fonts:      _fontsCache  || [],
            catNames:   _catCache    || {},
            paraDefault: _paraDefault || 'فۆنتەکانی یونی قەیدار',
            popular:    _popularCache || [],
        };
    })();

    return _loadingPromise;
}

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

// ── Build individual font page ────────────────────────────────────────────────
function buildFontPage(font, catNames, paraDefault) {
    // Every field from fonts.json
    const name        = font.name      || '';
    const path        = font.path      || `UniQaidarFonts/${name}.ttf`;
    const preview     = font.preview   || 'فۆنتەکانی یونی‌قەیدار';
    const paragraph   = (font.paragraph && font.paragraph.trim())
                            ? font.paragraph.trim()
                            : paraDefault; // exact same fallback as real site
    const lineHeight  = font.lineHeight || 1.8;
    const dateAdded   = font.dateAdded || '';
    const size        = font.size      || '';
    const allCats     = font.category  || [];
    const firstCat    = allCats[0]     || 'All';

    // All category labels for this font (every category, not just first)
    const catLabels   = allCats
        .map(c => catNames[c] || c)
        .join(' — ');

    const catLabel    = catNames[firstCat] || firstCat;

    // Canonical URL: matches sitemap format exactly (?cat=category[0]&font=name)
    const fontUrl  = `${BASE_URL}/?cat=${encodeURIComponent(firstCat)}&font=${encodeURIComponent(name)}`;
    // TTF direct download: use path from fonts.json (same as real site)
    const ttfUrl   = `${BASE_URL}/${path}`;
    const logoUrl  = `${BASE_URL}/Logo.png`;

    // Meta content — use preview as description (short, unique per font)
    // Description also includes paragraph truncated to 160 chars total
    const metaDesc = truncate(`${preview} — ${paragraph}`, 155);

    const title = `${escHtml(name)} - داگرتنی فۆنتی کوردی | UniQaidar`;
    const desc  = `${escHtml(metaDesc)} — فۆنتەکانی یونی‌قەیدار Kurdish Font.`;

    // JSON-LD
    const jName  = jsonSafe(name);
    const jUrl   = jsonSafe(fontUrl);
    const jDesc  = jsonSafe(`${preview} — ${paragraph}`);
    const jDate  = jsonSafe(dateAdded);
    const jSize  = jsonSafe(size);
    const jPath  = jsonSafe(ttfUrl);

    // Category tags for keywords
    const catKeywords = allCats.map(c => catNames[c] || c).join(', ');

    return `<!DOCTYPE html>
<html lang="ku" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${escHtml(name)}, ${escHtml(catKeywords)}, فۆنتی کوردی, Kurdish Font, UniQaidar, یونی‌قەیدار">
<meta name="robots" content="index, follow">
<meta name="author" content="Qaidar Rahim">
<link rel="canonical" href="${escHtml(fontUrl)}">
<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="UniQaidar Fonts — فۆنتەکانی یونی‌قەیدار">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escHtml(fontUrl)}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:image:width" content="699">
<meta property="og:image:height" content="232">
<meta property="og:image:alt" content="UniQaidar Fonts - Kurdish &amp; Arabic Font Library">
<meta property="og:locale" content="ckb_IQ">
<meta property="og:locale:alternate" content="en_US">
<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Qaidar_Rahim">
<meta name="twitter:creator" content="@Qaidar_Rahim">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${logoUrl}">
<!-- Geo -->
<meta name="geo.region" content="IQ-SU">
<meta name="geo.placename" content="Sulaymaniyah, Kurdistan Region, Iraq">
<!-- Schema.org JSON-LD -->
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
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a1a;color:#f0f0f0;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:24px 16px}
.wrap{background:#242424;border-radius:12px;padding:28px;max-width:760px;margin:0 auto}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
h1{font-size:1.3em;color:#f0f0f0;font-weight:600}
.new-badge{background:#ff5700;color:#fff;font-size:0.65em;padding:2px 7px;border-radius:4px;margin-left:8px;vertical-align:middle}
.card-date{font-size:0.8em;color:#888}
.cats{font-size:0.8em;color:#aaa;margin-bottom:16px}
.preview-box{font-size:2em;line-height:${lineHeight};margin:16px 0;padding:16px;background:#1a1a1a;border-radius:8px;border:1px solid #333;word-break:break-word;overflow-wrap:break-word}
.para-box{font-size:1.1em;line-height:${lineHeight};margin:12px 0;padding:14px;background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;color:#ccc;word-break:break-word;overflow-wrap:break-word}
.dl-row{display:flex;align-items:center;gap:12px;margin-top:20px;flex-wrap:wrap}
.btn{display:inline-block;padding:11px 26px;background:#ff5700;color:#fff;text-decoration:none;border-radius:8px;font-size:1em;font-family:inherit}
.size-tag{font-size:0.82em;color:#999;background:#1a1a1a;padding:5px 10px;border-radius:6px;border:1px solid #333}
.back{display:block;margin-top:18px;color:#aaa;text-decoration:none;font-size:0.88em}
</style>
</head>
<body>
<div class="wrap">
  <div class="card-header">
    <h1>${dateAdded ? `<span class="new-badge">نوێ</span>` : ''}${escHtml(name)}</h1>
    ${dateAdded ? `<span class="card-date">📅 ${escHtml(dateAdded)}</span>` : ''}
  </div>
  <div class="cats">${escHtml(catLabels)}</div>
  <div class="preview-box">${escHtml(preview)}</div>
  <div class="para-box">${escHtml(paragraph)}</div>
  <div class="dl-row">
    <a class="btn" href="${escHtml(ttfUrl)}" download>دابەزاندنی فۆنت</a>
    ${size ? `<span class="size-tag">${escHtml(size)}</span>` : ''}
  </div>
  <a class="back" href="${BASE_URL}/">&#8594; بگەڕێوە بۆ هەموو فۆنتەکان</a>
</div>
</body>
</html>`;
}

// ── Build category page ───────────────────────────────────────────────────────
function buildCategoryPage(cat, fonts, catNames) {
    const catLabel = catNames[cat] || cat;
    const count    = fonts.length;
    const catUrl   = `${BASE_URL}/?cat=${encodeURIComponent(cat)}`;
    const logoUrl  = `${BASE_URL}/Logo.png`;

    const title = `${escHtml(catLabel)} - فۆنتی کوردی | UniQaidar`;
    const desc  = `${count} فۆنتی کوردی بە خۆڕایی لە بەشی ${escHtml(catLabel)}. دابەزاندن و تاقیکردنەوەی فۆنتەکانی یونی‌قەیدار — ${count} free Kurdish fonts.`;

    const jLabel = jsonSafe(catLabel);
    const jUrl   = jsonSafe(catUrl);
    const jDesc  = jsonSafe(`${count} فۆنتی کوردی بە خۆڕایی لە بەشی ${catLabel}. فۆنتەکانی یونی‌قەیدار — ${count} free Kurdish fonts.`);

    const fontLinks = fonts.map(f => {
        const short    = f.name || '';
        const fCat     = (f.category || [])[0] || cat;
        const fUrl     = `${BASE_URL}/?cat=${encodeURIComponent(fCat)}&font=${encodeURIComponent(f.name)}`;
        const fPreview = f.preview || '';
        const fSize    = f.size    || '';
        const fDate    = f.dateAdded || '';
        return `    <li>
      <a href="${escHtml(fUrl)}">${escHtml(short)}</a>
      ${fPreview ? `<span class="fp">${escHtml(fPreview)}</span>` : ''}
      ${fSize    ? `<span class="fs">${escHtml(fSize)}</span>`    : ''}
      ${fDate    ? `<span class="fd">📅 ${escHtml(fDate)}</span>` : ''}
    </li>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="ku" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index, follow">
<meta name="author" content="Qaidar Rahim">
<link rel="canonical" href="${escHtml(catUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="UniQaidar Fonts — فۆنتەکانی یونی‌قەیدار">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escHtml(catUrl)}">
<meta property="og:image" content="${logoUrl}">
<meta property="og:locale" content="ckb_IQ">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@Qaidar_Rahim">
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
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a1a;color:#f0f0f0;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;padding:24px 16px}
.wrap{background:#242424;border-radius:12px;padding:28px;max-width:760px;margin:0 auto}
h1{font-size:1.4em;color:#ff5700;margin-bottom:6px}
.meta{font-size:0.85em;color:#999;margin-bottom:20px}
ul{list-style:none;padding:0}
li{padding:10px 0;border-bottom:1px solid #2e2e2e}
li:last-child{border-bottom:none}
a{color:#ff5700;text-decoration:none;font-size:1em}
a:hover{text-decoration:underline}
.fp{display:block;font-size:0.82em;color:#aaa;margin-top:3px}
.fs,.fd{font-size:0.75em;color:#666;margin-right:10px}
.back{display:block;margin-top:20px;color:#aaa;font-size:0.88em}
</style>
</head>
<body>
<div class="wrap">
  <h1>${escHtml(catLabel)}</h1>
  <div class="meta">${count} فۆنت — ${count} free Kurdish fonts</div>
  <ul>
${fontLinks}
  </ul>
  <a class="back" href="${BASE_URL}/">&#8594; بگەڕێوە بۆ هەموو فۆنتەکان</a>
</div>
</body>
</html>`;
}

// ── Main request handler ──────────────────────────────────────────────────────

export async function onRequestGet(context) {
    const ua = context.request.headers.get('User-Agent') || '';

    // 1. Humans pass through instantly — zero cost, zero change to their experience
    if (!isCrawler(ua)) {
        return context.next();
    }

    const reqUrl    = new URL(context.request.url);
    const fontParam = reqUrl.searchParams.get('font');
    const catParam  = reqUrl.searchParams.get('cat');

    // 2. Crawler with no font or cat param — pass through
    if (!fontParam && !catParam) {
        return context.next();
    }

    // 3. Load all data (cached at module level — fetched once per worker lifetime)
    let fonts, catNames, paraDefault, popular;
    try {
        ({ fonts, catNames, paraDefault, popular } = await loadData(context));
    } catch (_) {
        return context.next();
    }

    if (!Array.isArray(fonts) || fonts.length === 0) {
        return context.next();
    }

    // 4. Font page — fontParam wins when both params present
    if (fontParam) {
        const font = fonts.find(f => f.name === fontParam);
        if (!font) return context.next();

        return new Response(buildFontPage(font, catNames, paraDefault), {
            status: 200,
            headers: {
                'Content-Type':  'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                'X-Robots-Tag':  'index, follow',
                'Vary':          'User-Agent',
            }
        });
    }

    // 5. Category page
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

        return new Response(buildCategoryPage(catParam, catFonts, catNames), {
            status: 200,
            headers: {
                'Content-Type':  'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                'X-Robots-Tag':  'index, follow',
                'Vary':          'User-Agent',
            }
        });
    }

    return context.next();
}
