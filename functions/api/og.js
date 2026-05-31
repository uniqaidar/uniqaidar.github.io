// functions/api/og.js
// Dynamic SVG og image generator for UniQaidar Fonts.
//
// Routes:
//   /api/og?type=font&name=UniQAIDAR_Nastaliq+004+Typo  → font detail card
//   /api/og?type=cat&cat=Hawal                          → category card
//   /api/og?type=home                                   → homepage card (نوێترین فۆنت)
//
// Design: matches the website exactly — #1a1a1a bg, #242424 card, #ff5700 orange,
//         #1976d2 blue button, #f0f0f0 text, 12px border-radius, RTL layout.
// Size: 1200×630px (standard og image size).
// UI font: UniQAIDAR_Peregraf 01 — embedded as base64, used for all labels/text.
// Preview font (type=font only): the actual font TTF — embedded as base64.
// Logo: Logo.png embedded as base64 <image> element.
// No KV, no GitHub, no storage — generated in memory on every request.

const BASE_URL        = 'https://uniqaidar.pages.dev';
const FONTS_JSON_URL  = `${BASE_URL}/fonts.json`;
const POPULAR_URL     = `${BASE_URL}/popular.json`;
const LOGO_URL        = `${BASE_URL}/Logo.png`;
const UI_FONT_URL     = `${BASE_URL}/UniQaidarFonts/UniQAIDAR_Peregraf 01.ttf`;

// ── Module-level caches ────────────────────────────────────────────────────────
let _fontsCache   = null;
let _popularCache = null;
let _logoB64      = null;
let _uiFontB64    = null; // UniQAIDAR_Peregraf 01 base64 — used for all UI text
let _catCache     = null; // { catId → Kurdish label }
let _wasmModule   = null; // resvg-wasm WebAssembly instance — cached after first init
let _wasmIniting  = null; // in-flight init promise — prevents duplicate fetches

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

// ── Binary asset → base64 string ──────────────────────────────────────────────
async function toBase64(context, url) {
    try {
        const res = await fetchAsset(context, url);
        if (!res || !res.ok) return null;
        const buf = await res.arrayBuffer();
        const arr = new Uint8Array(buf);
        // Use chunked approach to avoid call stack overflow on large TTF files
        const CHUNK = 8192;
        let bin = '';
        for (let i = 0; i < arr.length; i += CHUNK) {
            bin += String.fromCharCode(...arr.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    } catch (_) {
        return null;
    }
}

// ── resvg-wasm: init once, render SVG → PNG ────────────────────────────────────
// WASM binary fetched from jsDelivr CDN at cold start, cached at module level.
// Falls back silently — callers always get SVG if PNG conversion fails.
const RESVG_WASM_URL = 'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm';

async function initResvg() {
    if (_wasmModule) return true;
    if (_wasmIniting) return _wasmIniting;
    _wasmIniting = (async () => {
        try {
            const res = await fetch(RESVG_WASM_URL);
            if (!res || !res.ok) return false;
            const wasmBuf = await res.arrayBuffer();
            // resvg-wasm exports: render(svg_str, opts_json) → Uint8Array PNG
            // We instantiate the raw WASM and call its exported functions directly.
            const mod = await WebAssembly.instantiate(wasmBuf, {
                // resvg-wasm 2.x imports — provide minimal stubs for non-essential imports
                './index_bg.js': {
                    __wbindgen_string_new: (ptr, len) => {
                        const mem = new Uint8Array(_wasmModule.exports.memory.buffer);
                        return _decodeStr(mem, ptr, len);
                    },
                    __wbindgen_throw: (ptr, len) => {
                        const mem = new Uint8Array(_wasmModule.exports.memory.buffer);
                        throw new Error(_decodeStr(mem, ptr, len));
                    },
                    __wbindgen_object_drop_ref: () => {},
                    __wbg_new_abda76e883ba8a5f: () => ({ ptr: 0 }),
                    __wbg_stack_658279fe44541cf6: () => {},
                    __wbg_error_f851667af71bcfc6: () => {},
                    __wbindgen_object_clone_ref: (x) => x,
                    __wbindgen_cb_drop: () => false,
                },
            });
            _wasmModule = mod.instance;
            return true;
        } catch (_) {
            return false;
        } finally {
            _wasmIniting = null;
        }
    })();
    return _wasmIniting;
}

function _decodeStr(mem, ptr, len) {
    return new TextDecoder().decode(mem.subarray(ptr, ptr + len));
}

function _encodeStr(str) {
    return new TextEncoder().encode(str);
}

// Render SVG string → PNG Uint8Array using resvg-wasm exports.
// Returns null if anything fails — callers fall back to SVG.
function _renderWithResvg(svgString) {
    try {
        const exports = _wasmModule.exports;
        const mem     = exports.memory;

        // Write SVG string into WASM memory
        const svgBytes  = _encodeStr(svgString);
        const optsBytes = _encodeStr(JSON.stringify({ font: { loadSystemFonts: false } }));

        // Allocate memory via resvg malloc export
        const svgPtr  = exports.__wbindgen_malloc(svgBytes.length, 1);
        new Uint8Array(mem.buffer).set(svgBytes, svgPtr);

        const optsPtr = exports.__wbindgen_malloc(optsBytes.length, 1);
        new Uint8Array(mem.buffer).set(optsBytes, optsPtr);

        // Call render — writes result pointer+length to retptr
        const retptr = exports.__wbindgen_add_to_stack_pointer(-16);
        exports.render(retptr, svgPtr, svgBytes.length, optsPtr, optsBytes.length);

        // Read result pointer and length from retptr
        const view   = new DataView(mem.buffer);
        const resPtr = view.getUint32(retptr,     true);
        const resLen = view.getUint32(retptr + 4, true);
        exports.__wbindgen_add_to_stack_pointer(16);

        if (!resPtr || !resLen) return null;

        // Copy PNG bytes out before freeing
        const png = new Uint8Array(mem.buffer, resPtr, resLen).slice();
        exports.__wbindgen_free(resPtr, resLen, 1);
        return png;
    } catch (_) {
        return null;
    }
}

async function svgToPng(svgString) {
    try {
        const ok = await initResvg();
        if (!ok) return null;
        return _renderWithResvg(svgString);
    } catch (_) {
        return null;
    }
}
async function loadAll(context) {
    if (_fontsCache && _popularCache && _logoB64 && _uiFontB64 && _catCache) {
        return {
            fonts:     _fontsCache,
            popular:   _popularCache,
            logoB64:   _logoB64,
            uiFontB64: _uiFontB64,
            catNames:  _catCache,
        };
    }

    const [fontsRes, popularRes, logoRes, uiFontRes, htmlRes] = await Promise.all([
        fetchAsset(context, FONTS_JSON_URL),
        fetchAsset(context, POPULAR_URL),
        fetchAsset(context, LOGO_URL),
        fetchAsset(context, UI_FONT_URL),
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
            const CHUNK = 8192;
            let bin = '';
            for (let i = 0; i < arr.length; i += CHUNK) {
                bin += String.fromCharCode(...arr.subarray(i, i + CHUNK));
            }
            _logoB64 = 'data:image/png;base64,' + btoa(bin);
        } catch (_) {}
    }

    if (!_uiFontB64 && uiFontRes && uiFontRes.ok) {
        try {
            const buf  = await uiFontRes.arrayBuffer();
            const arr  = new Uint8Array(buf);
            const CHUNK = 8192;
            let bin = '';
            for (let i = 0; i < arr.length; i += CHUNK) {
                bin += String.fromCharCode(...arr.subarray(i, i + CHUNK));
            }
            _uiFontB64 = btoa(bin);
        } catch (_) {}
    }

    if (!_catCache && htmlRes && htmlRes.ok) {
        try {
            const html = await htmlRes.text();
            _catCache  = {};
            const rx   = /<button class="filter-btn" onclick="filterFonts\('([^']+)',\s*this\)">([^<]+)<\/button>/g;
            let m;
            while ((m = rx.exec(html)) !== null) {
                _catCache[m[1]] = m[2].trim();
            }
        } catch (_) { _catCache = {}; }
    }

    return {
        fonts:     _fontsCache   || [],
        popular:   _popularCache || [],
        logoB64:   _logoB64      || '',
        uiFontB64: _uiFontB64    || '',
        catNames:  _catCache     || {},
    };
}

// ── Load a single TTF as base64 (preview font for type=font only) ─────────────
async function loadFontB64(context, fontPath) {
    return toBase64(context, `${BASE_URL}/${fontPath}`);
}

// ── SVG escape ────────────────────────────────────────────────────────────────
function esc(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Unicode-aware truncation ───────────────────────────────────────────────────
function trunc(str, max) {
    if (!str) return '';
    const chars = [...str];
    if (chars.length <= max) return str;
    return chars.slice(0, max).join('') + '…';
}

// ── Shared @font-face defs block ──────────────────────────────────────────────
// uiFontB64: base64 of UniQAIDAR_Peregraf 01 — used for all UI text
// previewB64: base64 of the actual font — used only for preview text in type=font
function buildDefs(uiFontB64, previewB64) {
    let css = '';
    if (uiFontB64) {
        css += `@font-face{font-family:'UQPeregraf';src:url('data:font/ttf;base64,${uiFontB64}') format('truetype');}`;
    }
    if (previewB64) {
        css += `@font-face{font-family:'PreviewFont';src:url('data:font/ttf;base64,${previewB64}') format('truetype');}`;
    }
    if (!css) return '';
    return `<defs><style>${css}</style></defs>`;
}

// ── UI font family string ──────────────────────────────────────────────────────
const UI_FONT  = "'UQPeregraf', Tahoma, Arial, sans-serif";
const FALLBACK = "Tahoma, Arial, sans-serif";

// ── Build SVG: Font detail card ────────────────────────────────────────────────
// Layout (1200×630):
//   0–6:     top orange bar
//   18–612:  main card (#242424, rx=12)
//   18–104:  header bar (#2a2a2a, rx=12) — orange dot + font name + date
//   104–454: preview area — large preview text in actual font, vertically centered
//   454–455: divider line (#333)
//   455–525: action bar — orange copy box + blue download btn + size badge
//   525–594: branding bar (#2a2a2a) — logo right + URL left + cat label center
//   624–630: bottom orange bar
function buildFontSvg(font, uiFontB64, previewB64, logoB64, catNames) {
    const name      = font.name      || '';
    const preview   = font.preview   || 'فۆنتەکانی یونی‌قەیدار';
    const size      = font.size      || '';
    const date      = font.dateAdded || '';
    const firstCat  = (font.category || [])[0] || '';
    const catLabel  = firstCat ? (catNames[firstCat] || firstCat) : '';

    const uiFont      = uiFontB64 ? UI_FONT : FALLBACK;
    const previewFont = previewB64 ? "'PreviewFont', Tahoma, Arial, sans-serif" : FALLBACK;
    const previewText = trunc(preview, 60);
    const defs        = buildDefs(uiFontB64, previewB64);

    // Action bar geometry — orange box + blue btn + optional size badge
    const copyBoxX  = 40;  const copyBoxW  = 60;
    const badgeW    = size ? 210 : 0;
    const badgeX    = size ? (1176 - badgeW) : 0;
    const dlX       = copyBoxX + copyBoxW + 8;
    const dlW       = size ? (badgeX - dlX - 8) : (1176 - dlX);
    const dlCenterX = dlX + dlW / 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
${defs}
<defs>
  <clipPath id="rowclip"><rect x="40" y="0" width="1120" height="630"/></clipPath>
</defs>
  <!-- Background -->
  <rect width="1200" height="630" fill="#1a1a1a"/>
  <!-- Top orange bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#ff5700"/>
  <!-- Main card -->
  <rect x="24" y="18" width="1152" height="594" rx="12" fill="#242424"/>
  <!-- Header bar -->
  <rect x="24" y="18" width="1152" height="86" rx="12" fill="#2a2a2a"/>
  <rect x="24" y="76" width="1152" height="28" fill="#2a2a2a"/>
  <!-- Orange dot -->
  <circle cx="62" cy="61" r="9" fill="#ff5700"/>
  <!-- Font name — LTR Latin, left-aligned after dot -->
  <text x="86" y="61"
    font-family="${uiFont}"
    font-size="22"
    fill="#f0f0f0"
    text-anchor="start"
    dominant-baseline="central">${esc(trunc(name, 50))}</text>
  <!-- Date — right-aligned -->
  ${date ? `<text x="1152" y="61"
    font-family="${uiFont}"
    font-size="15"
    fill="#666"
    text-anchor="end"
    dominant-baseline="central">${esc(date)}</text>` : ''}
  <!-- Preview area -->
  <rect x="24" y="104" width="1152" height="350" fill="#242424"/>
  <!-- Preview text — centered, actual font, RTL -->
  <text x="600" y="279"
    font-family="${previewFont}"
    font-size="44"
    fill="#f0f0f0"
    text-anchor="middle"
    dominant-baseline="central"
    direction="rtl"
    unicode-bidi="bidi-override">${esc(previewText)}</text>
  <!-- Divider -->
  <rect x="24" y="454" width="1152" height="1" fill="#333"/>
  <!-- Action bar -->
  <rect x="24" y="455" width="1152" height="70" fill="#242424"/>
  <!-- Orange copy box -->
  <rect x="${copyBoxX}" y="463" width="${copyBoxW}" height="54" rx="10" fill="#ff5700"/>
  <text x="${copyBoxX + copyBoxW / 2}" y="490"
    font-family="${uiFont}"
    font-size="26"
    fill="#fff"
    text-anchor="middle"
    dominant-baseline="central">🔗</text>
  <!-- Blue download button -->
  <rect x="${dlX}" y="463" width="${dlW}" height="54" rx="10" fill="#0984e3"/>
  <text x="${dlCenterX}" y="490"
    font-family="${uiFont}"
    font-size="22"
    fill="#fff"
    text-anchor="middle"
    dominant-baseline="central"
    direction="rtl">داونلۆدی فۆنت ↓</text>
  <!-- Size badge -->
  ${size ? `<rect x="${badgeX}" y="463" width="${badgeW}" height="54" rx="10" fill="#2e2e2e"/>
  <text x="${badgeX + badgeW / 2}" y="483"
    font-family="${uiFont}"
    font-size="18"
    fill="#aaa"
    text-anchor="middle"
    dominant-baseline="central">${esc(size)}</text>
  <text x="${badgeX + badgeW / 2}" y="505"
    font-family="${uiFont}"
    font-size="13"
    fill="#555"
    text-anchor="middle"
    dominant-baseline="central">قەبارەی فۆنت</text>` : ''}
  <!-- Branding bar -->
  <rect x="24" y="525" width="1152" height="69" rx="12" fill="#2a2a2a"/>
  <rect x="24" y="525" width="1152" height="28" fill="#2a2a2a"/>
  <!-- Logo -->
  ${logoB64
    ? `<image href="${logoB64}" x="936" y="534" width="216" height="42" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="1152" y="559" font-family="${uiFont}" font-size="18" fill="#ff5700" text-anchor="end" dominant-baseline="central">UniQaidar Fonts</text>`}
  <!-- URL -->
  <text x="40" y="559"
    font-family="${uiFont}"
    font-size="16"
    fill="#555"
    text-anchor="start"
    dominant-baseline="central">uniqaidar.pages.dev</text>
  <!-- Category label — centered -->
  ${catLabel ? `<text x="600" y="559"
    font-family="${uiFont}"
    font-size="16"
    fill="#777"
    text-anchor="middle"
    dominant-baseline="central">${esc(catLabel)} · فۆنتەکانی یونی قەیدار</text>` : `<text x="600" y="559"
    font-family="${uiFont}"
    font-size="16"
    fill="#777"
    text-anchor="middle"
    dominant-baseline="central">فۆنتی کوردی - فۆنتەکانی یونی قەیدار</text>`}
  <!-- Bottom orange bar -->
  <rect x="0" y="624" width="1200" height="6" fill="#ff5700"/>
</svg>`;
}

// ── Build SVG: Category card ───────────────────────────────────────────────────
// Layout (1200×630):
//   0–6:     top orange bar
//   18–612:  main card (#242424, rx=12)
//   18–104:  header bar (#2a2a2a) — orange dot + category label + count badge
//   110–490: three sample font rows (118px each, gap 6px)
//   494–594: branding bar (#2a2a2a)
//   624–630: bottom orange bar
function buildCatSvg(catId, catLabel, catFonts, uiFontB64, logoB64, sampleFontsB64) {
    const count   = catFonts.length;
    const samples = catFonts.slice(0, 3);
    const uiFont  = uiFontB64 ? UI_FONT : FALLBACK;

    const badgeLabel = `${count} فۆنت`;
    const badgeW     = Math.max(130, [...badgeLabel].length * 17 + 40);
    const badgeX     = 1156 - badgeW;
    // Label sits between dot (cx=62) and badge — right-aligned up to badgeX-16
    const labelX     = badgeX - 16;

    // Build @font-face for UI font + up to 3 sample fonts
    let defsCSS = '';
    if (uiFontB64) defsCSS += `@font-face{font-family:'UQPeregraf';src:url('data:font/ttf;base64,${uiFontB64}') format('truetype');}`;
    (sampleFontsB64 || []).forEach((b64, i) => {
        if (b64) defsCSS += `@font-face{font-family:'SampleFont${i}';src:url('data:font/ttf;base64,${b64}') format('truetype');}`;
    });
    const defs = defsCSS ? `<defs><style>${defsCSS}</style></defs>` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
${defs}
  <!-- Background -->
  <rect width="1200" height="630" fill="#1a1a1a"/>
  <!-- Top orange bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#ff5700"/>
  <!-- Main card -->
  <rect x="24" y="18" width="1152" height="594" rx="12" fill="#242424"/>
  <!-- Header bar -->
  <rect x="24" y="18" width="1152" height="86" rx="12" fill="#2a2a2a"/>
  <rect x="24" y="76" width="1152" height="28" fill="#2a2a2a"/>
  <!-- Orange dot -->
  <circle cx="62" cy="61" r="9" fill="#ff5700"/>
  <!-- Category label — after orange dot, extends right -->
  <text x="86" y="61"
    font-family="${uiFont}"
    font-size="26"
    fill="#f0f0f0"
    text-anchor="start"
    dominant-baseline="central">${esc(trunc(catLabel, 18))}</text>
  <!-- Count badge -->
  <rect x="${badgeX}" y="35" width="${badgeW}" height="50" rx="10" fill="#ff5700"/>
  <text x="${badgeX + badgeW / 2}" y="61"
    font-family="${uiFont}"
    font-size="20"
    fill="#fff"
    text-anchor="middle"
    dominant-baseline="central"
    direction="rtl">${esc(badgeLabel)}</text>

  <!-- Sample font rows -->
  ${samples.map((f, i) => {
    const rowY      = 110 + i * 124;
    const nameText  = trunc(f.name || '', 50);
    const prevText  = trunc(f.preview || 'فۆنتەکانی یونی‌قەیدار', 46);
    const rowFont   = (sampleFontsB64 && sampleFontsB64[i]) ? `'SampleFont${i}', Tahoma, Arial, sans-serif` : uiFont;
    return `
  <rect x="40" y="${rowY}" width="1120" height="112" rx="8" fill="#2a2a2a"/>
  <!-- Font name — LTR, right-aligned -->
  <text x="1148" y="${rowY + 26}"
    font-family="${uiFont}"
    font-size="13"
    fill="#666"
    text-anchor="end"
    dominant-baseline="central">${esc(nameText)}</text>
  <!-- Preview text — actual font, centered -->
  <text x="600" y="${rowY + 72}"
    font-family="${rowFont}"
    font-size="28"
    fill="#f0f0f0"
    text-anchor="middle"
    dominant-baseline="central"
    direction="rtl"
    unicode-bidi="bidi-override">${esc(prevText)}</text>`;
  }).join('')}

  <!-- Branding bar -->
  <rect x="24" y="494" width="1152" height="100" rx="12" fill="#2a2a2a"/>
  <rect x="24" y="494" width="1152" height="28" fill="#2a2a2a"/>
  ${logoB64
    ? `<image href="${logoB64}" x="936" y="510" width="216" height="42" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="1152" y="544" font-family="${uiFont}" font-size="18" fill="#ff5700" text-anchor="end" dominant-baseline="central">UniQaidar Fonts</text>`}
  <text x="40" y="544"
    font-family="${uiFont}"
    font-size="16"
    fill="#555"
    text-anchor="start"
    dominant-baseline="central">uniqaidar.pages.dev</text>
  <!-- Kurdish site label — centered -->
  <text x="600" y="544"
    font-family="${uiFont}"
    font-size="16"
    fill="#777"
    text-anchor="middle"
    dominant-baseline="central">فۆنتی کوردی - فۆنتەکانی یونی قەیدار</text>
  <!-- Bottom orange bar -->
  <rect x="0" y="624" width="1200" height="6" fill="#ff5700"/>
</svg>`;
}

// ── Build SVG: Homepage card (نوێترین فۆنت) ───────────────────────────────────
// Same layout as category card but title is نوێترین فۆنت and badge shows total count
function buildHomeSvg(nweFonts, totalCount, uiFontB64, logoB64, sampleFontsB64) {
    const samples    = nweFonts.slice(0, 3);
    const uiFont     = uiFontB64 ? UI_FONT : FALLBACK;
    const badgeLabel = `${totalCount}+ فۆنتی کوردی`;
    const badgeW     = Math.max(210, [...badgeLabel].length * 15 + 40);
    const badgeX     = 1156 - badgeW;
    const labelX     = badgeX - 16;

    // Build @font-face for UI font + up to 3 sample fonts
    let defsCSS = '';
    if (uiFontB64) defsCSS += `@font-face{font-family:'UQPeregraf';src:url('data:font/ttf;base64,${uiFontB64}') format('truetype');}`;
    (sampleFontsB64 || []).forEach((b64, i) => {
        if (b64) defsCSS += `@font-face{font-family:'SampleFont${i}';src:url('data:font/ttf;base64,${b64}') format('truetype');}`;
    });
    const defs = defsCSS ? `<defs><style>${defsCSS}</style></defs>` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
${defs}
  <!-- Background -->
  <rect width="1200" height="630" fill="#1a1a1a"/>
  <!-- Top orange bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#ff5700"/>
  <!-- Main card -->
  <rect x="24" y="18" width="1152" height="594" rx="12" fill="#242424"/>
  <!-- Header bar -->
  <rect x="24" y="18" width="1152" height="86" rx="12" fill="#2a2a2a"/>
  <rect x="24" y="76" width="1152" height="28" fill="#2a2a2a"/>
  <!-- Orange dot -->
  <circle cx="62" cy="61" r="9" fill="#ff5700"/>
  <!-- Title — after orange dot, extends right -->
  <text x="86" y="61"
    font-family="${uiFont}"
    font-size="26"
    fill="#f0f0f0"
    text-anchor="start"
    dominant-baseline="central">نوێترین فۆنت</text>
  <!-- Count badge -->
  <rect x="${badgeX}" y="35" width="${badgeW}" height="50" rx="10" fill="#ff5700"/>
  <text x="${badgeX + badgeW / 2}" y="61"
    font-family="${uiFont}"
    font-size="19"
    fill="#fff"
    text-anchor="middle"
    dominant-baseline="central"
    direction="rtl">${esc(badgeLabel)}</text>

  <!-- Sample font rows from Nwe category -->
  ${samples.map((f, i) => {
    const rowY     = 110 + i * 124;
    const nameText = trunc(f.name || '', 50);
    const prevText = trunc(f.preview || 'فۆنتەکانی یونی‌قەیدار', 46);
    const rowFont  = (sampleFontsB64 && sampleFontsB64[i]) ? `'SampleFont${i}', Tahoma, Arial, sans-serif` : uiFont;
    return `
  <rect x="40" y="${rowY}" width="1120" height="112" rx="8" fill="#2a2a2a"/>
  <!-- Font name — LTR, right-aligned -->
  <text x="1148" y="${rowY + 26}"
    font-family="${uiFont}"
    font-size="13"
    fill="#666"
    text-anchor="end"
    dominant-baseline="central">${esc(nameText)}</text>
  <!-- Preview text — actual font, centered -->
  <text x="600" y="${rowY + 72}"
    font-family="${rowFont}"
    font-size="28"
    fill="#f0f0f0"
    text-anchor="middle"
    dominant-baseline="central"
    direction="rtl"
    unicode-bidi="bidi-override">${esc(prevText)}</text>`;
  }).join('')}

  <!-- Branding bar -->
  <rect x="24" y="494" width="1152" height="100" rx="12" fill="#2a2a2a"/>
  <rect x="24" y="494" width="1152" height="28" fill="#2a2a2a"/>
  ${logoB64
    ? `<image href="${logoB64}" x="936" y="510" width="216" height="42" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="1152" y="544" font-family="${uiFont}" font-size="18" fill="#ff5700" text-anchor="end" dominant-baseline="central">UniQaidar Fonts</text>`}
  <text x="40" y="544"
    font-family="${uiFont}"
    font-size="16"
    fill="#555"
    text-anchor="start"
    dominant-baseline="central">uniqaidar.pages.dev</text>
  <!-- Kurdish site label — centered -->
  <text x="600" y="544"
    font-family="${uiFont}"
    font-size="16"
    fill="#777"
    text-anchor="middle"
    dominant-baseline="central">فۆنتی کوردی - فۆنتەکانی یونی قەیدار</text>
  <!-- Bottom orange bar -->
  <rect x="0" y="624" width="1200" height="6" fill="#ff5700"/>
</svg>`;
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function onRequestGet(context) {
    const url  = new URL(context.request.url);
    const type = url.searchParams.get('type') || 'home';
    const name = url.searchParams.get('name') || '';
    const cat  = url.searchParams.get('cat')  || '';

    const svgHeaders = {
        'Content-Type':                'image/svg+xml',
        'Cache-Control':               'public, max-age=86400, s-maxage=86400',
        'CDN-Cache-Control':           'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
    };
    const pngHeaders = {
        'Content-Type':                'image/png',
        'Cache-Control':               'public, max-age=86400, s-maxage=86400',
        'CDN-Cache-Control':           'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
    };

    function respond(svg) {
        return svgToPng(svg).then(png => {
            if (png) return new Response(png, { status: 200, headers: pngHeaders });
            return new Response(svg, { status: 200, headers: svgHeaders });
        }).catch(() => new Response(svg, { status: 200, headers: svgHeaders }));
    }

    try {
        const { fonts, popular, logoB64, uiFontB64, catNames } = await loadAll(context);

        // ── Font card ──────────────────────────────────────────────────────────
        if (type === 'font' && name) {
            const font = fonts.find(f => f.name === name);
            if (!font) return new Response('Not found', { status: 404 });
            const previewB64 = await loadFontB64(context, font.path);
            const svg = buildFontSvg(font, uiFontB64, previewB64, logoB64, catNames);
            return respond(svg);
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

            if (!catFonts.length) return new Response('Not found', { status: 404 });

            const catLabel = catNames[cat] || cat;
            const samples3 = catFonts.slice(0, 3);
            const sampleFontsB64 = await Promise.all(
                samples3.map(f => loadFontB64(context, f.path))
            );
            const svg = buildCatSvg(cat, catLabel, catFonts, uiFontB64, logoB64, sampleFontsB64);
            return respond(svg);
        }

        // ── Homepage card (نوێترین فۆنت) ──────────────────────────────────────
        const nweFonts = fonts.filter(f =>
            Array.isArray(f.category) && f.category.includes('Nwe')
        );
        const nweSamples3 = nweFonts.slice(0, 3);
        const nweFontsB64 = await Promise.all(
            nweSamples3.map(f => loadFontB64(context, f.path))
        );
        const svg = buildHomeSvg(nweFonts, fonts.length, uiFontB64, logoB64, nweFontsB64);
        return respond(svg);

    } catch (err) {
        return new Response('Error: ' + err.message, { status: 500 });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
