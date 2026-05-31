// functions/api/og.js
// Dynamic SVG og image generator for UniQaidar Fonts.
//
// Routes:
//   /api/og?type=font&name=UniQAIDAR_Hawal+001   → font detail card
//   /api/og?type=cat&cat=Hawal                   → category card
//   /api/og?type=home                            → homepage card (نوێترین فۆنت)
//
// Design: matches the website exactly — #1a1a1a bg, #242424 card, #ff5700 orange,
//         #07beff cyan, #f0f0f0 text, 12px border-radius, RTL layout.
// Size: 1200×630px (standard og image size).
// Font: TTF embedded as base64 for preview text — renders in the actual font.
// Logo: Logo.png embedded via base64 for pixel-perfect branding.
// No storage, no KV, no GitHub — generated in memory on every request.

const BASE_URL       = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL = `${BASE_URL}/fonts.json`;
const POPULAR_URL    = `${BASE_URL}/popular.json`;
const LOGO_URL       = `${BASE_URL}/Logo.png`;

// ── Module-level caches ────────────────────────────────────────────────────────
let _fontsCache   = null;
let _popularCache = null;
let _logoB64      = null;
let _catCache     = null; // { catId → Kurdish label }

// ── Asset fetcher ──────────────────────────────────────────────────────────────
async function fetchAsset(context, url) {
    if (context.env && context.env.ASSETS) {
        try {
            const res = await context.env.ASSETS.fetch(new Request(url));
            if (res.ok) return res;
        } catch (_) {}
    }
    return fetch(url, { headers: { 'User-Agent': 'UniQaidar-OG/1.0' } });
}

// ── Load fonts.json, popular.json, Logo.png, category labels ──────────────────
async function loadAll(context) {
    if (_fontsCache && _popularCache && _logoB64 && _catCache) {
        return { fonts: _fontsCache, popular: _popularCache, logoB64: _logoB64, catNames: _catCache };
    }

    const [fontsRes, popularRes, logoRes, htmlRes] = await Promise.all([
        fetchAsset(context, FONTS_JSON_URL),
        fetchAsset(context, POPULAR_URL),
        fetchAsset(context, LOGO_URL),
        fetchAsset(context, `${BASE_URL}/`),
    ]);

    if (!_fontsCache && fontsRes && fontsRes.ok) {
        try {
            const parsed = await fontsRes.json();
            if (Array.isArray(parsed) && parsed.length) _fontsCache = parsed;
        } catch (_) {}
    }

    if (!_popularCache && popularRes && popularRes.ok) {
        try {
            const parsed = await popularRes.json();
            if (Array.isArray(parsed) && parsed.length) _popularCache = parsed;
        } catch (_) {}
    }

    if (!_logoB64 && logoRes && logoRes.ok) {
        try {
            const buf  = await logoRes.arrayBuffer();
            const arr  = new Uint8Array(buf);
            let bin = '';
            for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
            _logoB64 = 'data:image/png;base64,' + btoa(bin);
        } catch (_) {}
    }

    if (!_catCache && htmlRes && htmlRes.ok) {
        try {
            const html = await htmlRes.text();
            _catCache = {};
            const rx = /<button class="filter-btn" onclick="filterFonts\('([^']+)',\s*this\)">([^<]+)<\/button>/g;
            let m;
            while ((m = rx.exec(html)) !== null) {
                _catCache[m[1]] = m[2].trim();
            }
        } catch (_) { _catCache = {}; }
    }

    return {
        fonts:    _fontsCache   || [],
        popular:  _popularCache || [],
        logoB64:  _logoB64      || '',
        catNames: _catCache     || {},
    };
}

// ── Load a TTF file as base64 for SVG font embedding ──────────────────────────
async function loadFontB64(context, fontPath) {
    try {
        const url = `${BASE_URL}/${fontPath}`;
        const res = await fetchAsset(context, url);
        if (!res || !res.ok) return null;
        const buf = await res.arrayBuffer();
        const arr = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
        return btoa(bin);
    } catch (_) {
        return null;
    }
}

// ── Escape SVG text content ────────────────────────────────────────────────────
function esc(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Truncate string safely ─────────────────────────────────────────────────────
function trunc(str, max) {
    if (!str) return '';
    const chars = [...str];
    if (chars.length <= max) return str;
    return chars.slice(0, max).join('') + '…';
}

// ── Build SVG: Font detail card ────────────────────────────────────────────────
function buildFontSvg(font, fontB64, logoB64) {
    const name     = font.name    || '';
    const preview  = font.preview || 'فۆنتەکانی یونی‌قەیدار';
    const size     = font.size    || '';
    const date     = font.dateAdded || '';
    const cats     = (font.category || []);
    const firstCat = cats[0] || '';

    const fontFaceBlock = fontB64
        ? `<defs><style>@font-face{font-family:'PreviewFont';src:url('data:font/ttf;base64,${fontB64}') format('truetype');}</style></defs>`
        : '';

    const previewFamily = fontB64 ? 'PreviewFont' : 'Tahoma, Arial, sans-serif';

    // Truncate preview text for display
    const previewText = trunc(preview, 40);

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
${fontFaceBlock}
  <!-- Background -->
  <rect width="1200" height="630" fill="#1a1a1a"/>

  <!-- Top orange bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#ff5700"/>

  <!-- Main card -->
  <rect x="32" y="32" width="1136" height="566" rx="12" fill="#242424"/>

  <!-- Card header bar -->
  <rect x="32" y="32" width="1136" height="72" rx="12" fill="#2a2a2a"/>
  <rect x="32" y="80" width="1136" height="24" fill="#2a2a2a"/>

  <!-- Orange dot -->
  <circle cx="68" cy="68" r="8" fill="#ff5700"/>

  <!-- Font name -->
  <text x="92" y="76" font-family="Tahoma, Arial, sans-serif" font-size="24" fill="#f0f0f0" text-anchor="start" dominant-baseline="middle">${esc(name)}</text>

  <!-- Date -->
  ${date ? `<text x="1148" y="68" font-family="Tahoma, Arial, sans-serif" font-size="16" fill="#666" text-anchor="end" dominant-baseline="middle">${esc(date)}</text>` : ''}

  <!-- Preview text area -->
  <rect x="32" y="104" width="1136" height="348" fill="#242424"/>

  <!-- Preview text in actual font — RTL, centered -->
  <text x="600" y="295"
    font-family="${previewFamily}"
    font-size="72"
    fill="#f0f0f0"
    text-anchor="middle"
    dominant-baseline="middle"
    direction="rtl"
    unicode-bidi="embed">${esc(previewText)}</text>

  <!-- Divider -->
  <rect x="32" y="452" width="1136" height="1" fill="#333"/>

  <!-- Bottom bar -->
  <rect x="32" y="453" width="1136" height="113" rx="0" fill="#242424"/>
  <rect x="32" y="513" width="1136" height="53" rx="12" fill="#242424"/>
  <rect x="32" y="453" width="1136" height="12" fill="#242424"/>

  <!-- Download button -->
  <rect x="52" y="465" width="680" height="56" rx="8" fill="#1976d2"/>
  <text x="392" y="499" font-family="Tahoma, Arial, sans-serif" font-size="24" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">داونلۆدی فۆنت  ↓</text>

  <!-- Orange copy icon box -->
  <rect x="52" y="465" width="56" height="56" rx="8" fill="#ff5700"/>
  <text x="80" y="499" font-family="Tahoma, Arial, sans-serif" font-size="20" fill="#fff" text-anchor="middle" dominant-baseline="middle">🔗</text>

  <!-- Size badge -->
  ${size ? `<rect x="752" y="465" width="180" height="56" rx="8" fill="#2e2e2e"/>
  <text x="842" y="491" font-family="Tahoma, Arial, sans-serif" font-size="20" fill="#aaa" text-anchor="middle" dominant-baseline="middle">${esc(size)}</text>
  <text x="842" y="511" font-family="Tahoma, Arial, sans-serif" font-size="13" fill="#555" text-anchor="middle" dominant-baseline="middle">حجمی فایل</text>` : ''}

  <!-- Bottom branding -->
  <rect x="32" y="521" width="1136" height="45" rx="12" fill="#2a2a2a"/>
  <rect x="32" y="521" width="1136" height="22" fill="#2a2a2a"/>

  <!-- Logo image -->
  ${logoB64 ? `<image href="${logoB64}" x="940" y="526" width="210" height="30" preserveAspectRatio="xMidYMid meet"/>` : `<text x="1148" y="549" font-family="Tahoma, Arial, sans-serif" font-size="18" fill="#ff5700" text-anchor="end" font-weight="bold">UniQaidar Fonts</text>`}

  <!-- URL -->
  <text x="52" y="549" font-family="Tahoma, Arial, sans-serif" font-size="16" fill="#555" text-anchor="start" dominant-baseline="middle">uniqaidar.pages.dev</text>

  <!-- Category label -->
  ${firstCat ? `<text x="600" y="549" font-family="Tahoma, Arial, sans-serif" font-size="16" fill="#666" text-anchor="middle" dominant-baseline="middle">${esc(firstCat)}</text>` : ''}

  <!-- Bottom orange line -->
  <rect x="0" y="624" width="1200" height="6" fill="#ff5700"/>
</svg>`;
}

// ── Build SVG: Category card ───────────────────────────────────────────────────
function buildCatSvg(catId, catLabel, catFonts, logoB64) {
    const count = catFonts.length;
    // Take up to 3 fonts for preview rows — use their preview text
    const samples = catFonts.slice(0, 3);

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Background -->
  <rect width="1200" height="630" fill="#1a1a1a"/>

  <!-- Top orange bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#ff5700"/>

  <!-- Main card -->
  <rect x="32" y="32" width="1136" height="566" rx="12" fill="#242424"/>

  <!-- Card header -->
  <rect x="32" y="32" width="1136" height="72" rx="12" fill="#2a2a2a"/>
  <rect x="32" y="80" width="1136" height="24" fill="#2a2a2a"/>

  <!-- Orange dot -->
  <circle cx="68" cy="68" r="8" fill="#ff5700"/>

  <!-- Category label -->
  <text x="92" y="68" font-family="Tahoma, Arial, sans-serif" font-size="26" fill="#f0f0f0" text-anchor="start" dominant-baseline="middle">${esc(catLabel)}</text>

  <!-- Font count badge -->
  <rect x="980" y="44" width="168" height="48" rx="8" fill="#ff5700"/>
  <text x="1064" y="68" font-family="Tahoma, Arial, sans-serif" font-size="22" fill="#fff" text-anchor="middle" dominant-baseline="middle">${count} فۆنت</text>

  <!-- Sample font rows -->
  ${samples.map((f, i) => {
    const y = 148 + i * 130;
    const previewText = trunc(f.preview || 'فۆنتەکانی یونی‌قەیدار', 38);
    return `
  <!-- Sample ${i + 1} -->
  <rect x="52" y="${y - 20}" width="1096" height="110" rx="8" fill="#2a2a2a"/>
  <text x="1108" y="${y + 10}" font-family="Tahoma, Arial, sans-serif" font-size="13" fill="#666" text-anchor="end" dominant-baseline="middle">${esc(f.name)}</text>
  <text x="1108" y="${y + 50}" font-family="Tahoma, Arial, sans-serif" font-size="32" fill="#f0f0f0" text-anchor="end" dominant-baseline="middle" direction="rtl">${esc(previewText)}</text>`;
  }).join('')}

  <!-- Bottom branding -->
  <rect x="32" y="553" width="1136" height="45" rx="12" fill="#2a2a2a"/>
  <rect x="32" y="553" width="1136" height="22" fill="#2a2a2a"/>

  ${logoB64 ? `<image href="${logoB64}" x="940" y="558" width="210" height="30" preserveAspectRatio="xMidYMid meet"/>` : `<text x="1148" y="580" font-family="Tahoma, Arial, sans-serif" font-size="18" fill="#ff5700" text-anchor="end">UniQaidar Fonts</text>`}
  <text x="52" y="580" font-family="Tahoma, Arial, sans-serif" font-size="16" fill="#555" text-anchor="start" dominant-baseline="middle">uniqaidar.pages.dev</text>

  <!-- Bottom orange line -->
  <rect x="0" y="624" width="1200" height="6" fill="#ff5700"/>
</svg>`;
}

// ── Build SVG: Homepage card (نوێترین فۆنت) ───────────────────────────────────
function buildHomeSvg(nweFonts, fontCount, logoB64) {
    const samples = nweFonts.slice(0, 3);

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Background -->
  <rect width="1200" height="630" fill="#1a1a1a"/>

  <!-- Top orange bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#ff5700"/>

  <!-- Main card -->
  <rect x="32" y="32" width="1136" height="566" rx="12" fill="#242424"/>

  <!-- Header -->
  <rect x="32" y="32" width="1136" height="72" rx="12" fill="#2a2a2a"/>
  <rect x="32" y="80" width="1136" height="24" fill="#2a2a2a"/>

  <!-- Orange dot -->
  <circle cx="68" cy="68" r="8" fill="#ff5700"/>

  <!-- Title: نوێترین فۆنت -->
  <text x="92" y="68" font-family="Tahoma, Arial, sans-serif" font-size="26" fill="#f0f0f0" text-anchor="start" dominant-baseline="middle">نوێترین فۆنت</text>

  <!-- Font count badge -->
  <rect x="900" y="44" width="248" height="48" rx="8" fill="#ff5700"/>
  <text x="1024" y="68" font-family="Tahoma, Arial, sans-serif" font-size="20" fill="#fff" text-anchor="middle" dominant-baseline="middle">${fontCount}+ فۆنتی کوردی</text>

  <!-- Sample font rows from Nwe category -->
  ${samples.map((f, i) => {
    const y = 148 + i * 130;
    const previewText = trunc(f.preview || 'فۆنتەکانی یونی‌قەیدار', 38);
    return `
  <rect x="52" y="${y - 20}" width="1096" height="110" rx="8" fill="#2a2a2a"/>
  <text x="1108" y="${y + 10}" font-family="Tahoma, Arial, sans-serif" font-size="13" fill="#666" text-anchor="end" dominant-baseline="middle">${esc(f.name)}</text>
  <text x="1108" y="${y + 50}" font-family="Tahoma, Arial, sans-serif" font-size="32" fill="#f0f0f0" text-anchor="end" dominant-baseline="middle" direction="rtl">${esc(previewText)}</text>`;
  }).join('')}

  <!-- Branding -->
  <rect x="32" y="553" width="1136" height="45" rx="12" fill="#2a2a2a"/>
  <rect x="32" y="553" width="1136" height="22" fill="#2a2a2a"/>

  ${logoB64 ? `<image href="${logoB64}" x="940" y="558" width="210" height="30" preserveAspectRatio="xMidYMid meet"/>` : `<text x="1148" y="580" font-family="Tahoma, Arial, sans-serif" font-size="18" fill="#ff5700" text-anchor="end">UniQaidar Fonts</text>`}
  <text x="52" y="580" font-family="Tahoma, Arial, sans-serif" font-size="16" fill="#555" text-anchor="start" dominant-baseline="middle">uniqaidar.pages.dev</text>

  <!-- Bottom orange line -->
  <rect x="0" y="624" width="1200" height="6" fill="#ff5700"/>
</svg>`;
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function onRequestGet(context) {
    const url  = new URL(context.request.url);
    const type = url.searchParams.get('type') || 'home';
    const name = url.searchParams.get('name') || '';
    const cat  = url.searchParams.get('cat')  || '';

    const headers = {
        'Content-Type':                 'image/svg+xml',
        'Cache-Control':                'public, max-age=86400, s-maxage=86400',
        'CDN-Cache-Control':            'public, max-age=86400',
        'Access-Control-Allow-Origin':  '*',
    };

    try {
        const { fonts, popular, logoB64, catNames } = await loadAll(context);

        // ── Font card ──────────────────────────────────────────────────────────
        if (type === 'font' && name) {
            const font = fonts.find(f => f.name === name);
            if (!font) {
                return new Response('Not found', { status: 404 });
            }
            const fontB64 = await loadFontB64(context, font.path);
            const svg = buildFontSvg(font, fontB64, logoB64);
            return new Response(svg, { status: 200, headers });
        }

        // ── Category card ──────────────────────────────────────────────────────
        if (type === 'cat' && cat) {
            const catLower = cat.toLowerCase();
            let catFonts;

            if (catLower === 'all') {
                catFonts = fonts;
            } else if (catLower === 'trending') {
                const fontMap = Object.fromEntries(fonts.map(f => [f.name, f]));
                catFonts = popular.map(n => fontMap[n]).filter(Boolean);
            } else {
                catFonts = fonts.filter(f =>
                    Array.isArray(f.category) &&
                    f.category.some(c => c.toLowerCase() === catLower)
                );
            }

            if (!catFonts.length) {
                return new Response('Not found', { status: 404 });
            }

            const catLabel = catNames[cat] || cat;
            const svg = buildCatSvg(cat, catLabel, catFonts, logoB64);
            return new Response(svg, { status: 200, headers });
        }

        // ── Homepage card (نوێترین فۆنت) ──────────────────────────────────────
        const nweFonts = fonts.filter(f =>
            Array.isArray(f.category) && f.category.includes('Nwe')
        );
        const svg = buildHomeSvg(nweFonts, fonts.length, logoB64);
        return new Response(svg, { status: 200, headers });

    } catch (err) {
        return new Response('Error: ' + err.message, { status: 500 });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }});
}
