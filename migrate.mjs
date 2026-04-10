// migrate.mjs — One-time full KV dump → historicaldata/
// Fetches every dl: and vt: key from Cloudflare KV via REST API,
// packages them into archive files (≤5 MB each), writes them under
// historicaldata/, updates index.json, then calls /api/purge for each date.
//
// Required environment variables (set as GitHub repo secrets):
//   CF_ACCOUNT_ID      — Cloudflare account ID
//   CF_API_TOKEN       — Cloudflare API token (KV read + write)
//   CF_KV_NAMESPACE    — KV namespace ID (the "UQDATA" binding's namespace ID)
//   ARCHIVE_TOKEN      — same secret used by purge.js
//   PAGES_BASE_URL     — e.g. https://uniqaidar.pages.dev

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN    = process.env.CF_API_TOKEN;
const CF_KV_NAMESPACE = process.env.CF_KV_NAMESPACE;
const ARCHIVE_TOKEN   = process.env.ARCHIVE_TOKEN;
const PAGES_BASE_URL  = process.env.PAGES_BASE_URL || 'https://uniqaidar.pages.dev';

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}`;
const HEADERS  = { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' };
const HIST_DIR = 'historicaldata';
const MAX_BYTES = 4.5 * 1024 * 1024; // 4.5 MB — leave head room under GitHub's 5 MB warning

// ── helpers ──────────────────────────────────────────────────────────────
async function cfFetch(url, opts = {}) {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(url, { headers: HEADERS, ...opts });
    if (!r.ok) {
        const t = await r.text();
        throw new Error(`CF API ${r.status}: ${t.slice(0, 300)}`);
    }
    return r.json();
}

// List ALL keys with a given prefix (handles cursor pagination)
async function listKeys(prefix) {
    const keys = [];
    let cursor = null;
    do {
        const qs  = new URLSearchParams({ prefix, limit: '1000' });
        if (cursor) qs.set('cursor', cursor);
        const res = await cfFetch(`${KV_BASE}/keys?${qs}`);
        for (const k of (res.result || [])) keys.push(k.name);
        cursor = res.result_info?.cursor || null;
        if (!res.result_info?.count || res.result_info.count < 1000) cursor = null;
    } while (cursor);
    return keys;
}

// Fetch a single KV value (JSON array)
async function getKey(key) {
    try {
        const { default: fetch } = await import('node-fetch');
        const r = await fetch(`${KV_BASE}/values/${encodeURIComponent(key)}`, { headers: HEADERS });
        if (!r.ok) return [];
        return await r.json();
    } catch(e) {
        console.warn(`  ⚠ Could not fetch key "${key}": ${e.message}`);
        return [];
    }
}

// ── main ─────────────────────────────────────────────────────────────────
(async () => {
    console.log('🚀 UniQaidar KV → GitHub migration starting…\n');

    // 1. List all dl: and vt: keys
    console.log('📋 Listing KV keys…');
    const [dlKeys, vtKeys] = await Promise.all([
        listKeys('dl:'),
        listKeys('vt:'),
    ]);
    console.log(`   Found ${dlKeys.length} download keys, ${vtKeys.length} visit keys\n`);

    if (!dlKeys.length && !vtKeys.length) {
        console.log('✅ Nothing to migrate — KV is already empty.');
        process.exit(0);
    }

    // 2. Group keys by date (YYYY-MM-DD)  — key format: dl:YYYY-MM-DD[:HH]
    function dateOf(key) { return key.split(':').slice(1, 3).join(':').slice(0, 10); }

    const dlDates = [...new Set(dlKeys.map(dateOf))].sort();
    const vtDates = [...new Set(vtKeys.map(dateOf))].sort();
    const allDates = [...new Set([...dlDates, ...vtDates])].sort();
    console.log(`📅 Dates found: ${allDates.join(', ')}\n`);

    // 3. Fetch all data, grouped by date
    const byDate = {};
    for (const date of allDates) byDate[date] = { date, downloads: [], visits: [] };

    console.log('⬇  Fetching download keys…');
    for (const key of dlKeys) {
        const events = await getKey(key);
        if (Array.isArray(events)) byDate[dateOf(key)].downloads.push(...events);
    }

    console.log('⬇  Fetching visit keys…');
    for (const key of vtKeys) {
        const events = await getKey(key);
        if (Array.isArray(events)) byDate[dateOf(key)].visits.push(...events);
    }

    // Sort events within each date newest-first
    for (const d of Object.values(byDate)) {
        d.downloads.sort((a, b) => (b.ts || b.date || '') > (a.ts || a.date || '') ? 1 : -1);
        d.visits.sort((a, b)    => (b.ts || b.date || '') > (a.ts || a.date || '') ? 1 : -1);
    }

    // 4. Load existing archive index (so we can APPEND, not overwrite)
    mkdirSync(HIST_DIR, { recursive: true });
    const idxPath = join(HIST_DIR, 'index.json');
    let existingFiles = [];
    if (existsSync(idxPath)) {
        try {
            const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
            existingFiles = Array.isArray(idx.files) ? idx.files : [];
        } catch(_) {}
    }
    console.log(`\n📦 Existing archive files: ${existingFiles.join(', ') || 'none'}`);

    // Find the highest existing archive number so we can continue from there
    let archiveNum = 0;
    for (const fn of existingFiles) {
        const m = fn.match(/archive_(\d+)\.json/);
        if (m) archiveNum = Math.max(archiveNum, parseInt(m[1]));
    }

    // 5. Load the last existing archive file (we'll append to it if still < MAX_BYTES)
    let currentBatch  = [];
    let currentBytes  = 0;
    const writtenFiles = [...existingFiles];

    // Try to load last archive file so we can append
    if (archiveNum > 0) {
        const lastFn   = `archive_${archiveNum}.json`;
        const lastPath = join(HIST_DIR, lastFn);
        if (existsSync(lastPath)) {
            try {
                currentBatch = JSON.parse(readFileSync(lastPath, 'utf8'));
                currentBytes = Buffer.byteLength(JSON.stringify(currentBatch), 'utf8');
                console.log(`   Continuing from ${lastFn} (${(currentBytes/1024).toFixed(1)} KB so far)`);
            } catch(_) { currentBatch = []; currentBytes = 0; }
        }
    }

    function flushBatch() {
        const fn   = `archive_${archiveNum}.json`;
        const path = join(HIST_DIR, fn);
        writeFileSync(path, JSON.stringify(currentBatch));
        if (!writtenFiles.includes(fn)) writtenFiles.push(fn);
        console.log(`   ✅ Wrote ${fn} (${(Buffer.byteLength(JSON.stringify(currentBatch),'utf8')/1024).toFixed(1)} KB, ${currentBatch.length} days)`);
    }

    // 6. Write date objects into archive files, splitting at MAX_BYTES
    const sortedDates = Object.keys(byDate).sort();
    for (const date of sortedDates) {
        const dayObj   = byDate[date];
        const dayBytes = Buffer.byteLength(JSON.stringify(dayObj), 'utf8');

        if (currentBytes + dayBytes > MAX_BYTES && currentBatch.length > 0) {
            flushBatch();
            archiveNum++;
            currentBatch = [];
            currentBytes = 0;
        }

        currentBatch.push(dayObj);
        currentBytes += dayBytes;
    }

    // Flush remaining data
    if (currentBatch.length > 0) {
        flushBatch();
    }

    // 7. Write updated index.json
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
    const newIdx = { files: writtenFiles, updated: today };
    writeFileSync(idxPath, JSON.stringify(newIdx, null, 2));
    console.log(`\n📄 Updated index.json: ${JSON.stringify(newIdx)}`);

    // 8. Purge KV keys for each date via /api/purge
    if (!ARCHIVE_TOKEN) {
        console.log('\n⚠  ARCHIVE_TOKEN not set — skipping KV purge. Delete keys manually.');
    } else {
        console.log('\n🗑  Purging KV keys…');
        const { default: fetch } = await import('node-fetch');
        for (const date of allDates) {
            try {
                const r = await fetch(`${PAGES_BASE_URL}/api/purge`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ARCHIVE_TOKEN}` },
                    body:    JSON.stringify({ date }),
                });
                const j = await r.json();
                if (j.ok) console.log(`   ✅ Purged ${date}: ${j.deleted} keys deleted`);
                else      console.warn(`   ⚠  Purge ${date}: ${j.error}`);
            } catch(e) {
                console.warn(`   ⚠  Purge ${date} failed: ${e.message}`);
            }
        }
    }

    console.log('\n🎉 Migration complete!');
    console.log(`   Archive files: ${writtenFiles.join(', ')}`);
    console.log('   Your KV should now contain only today\'s live data.');
})();
