// functions/api/stats.js
// Admin panel reads ALL stats from KV — returns full rich metadata objects
// Supports both old daily keys (dl:YYYY-MM-DD, vt:YYYY-MM-DD)
// AND new hourly keys (dl:YYYY-MM-DD:HH, vt:YYYY-MM-DD:HH)
// Optional ?date=YYYY-MM-DD param — returns only that day's data (used by archive job)
// KV binding: UQDATA

export async function onRequestGet(context) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
    try {
        const { UQDATA, ADMIN_TOKEN } = context.env;
        if (!UQDATA) return new Response(JSON.stringify({ ok:false, error:'KV not bound' }), { status:500, headers:cors });

        if (ADMIN_TOKEN) {
            const auth = context.request.headers.get('Authorization') || '';
            if (auth !== `Bearer ${ADMIN_TOKEN}`) {
                return new Response(JSON.stringify({ ok:false, error:'Unauthorized' }), { status:401, headers:cors });
            }
        }

        const url    = new URL(context.request.url);
        const type   = url.searchParams.get('type') || 'both';
        // Optional date filter — if set, only return keys for that specific date
        const dateFilter = url.searchParams.get('date') || null;

        async function listAllKeys(prefix) {
            const keys = [];
            let cursor = undefined;
            do {
                const opts = { prefix, limit: 1000 };
                if (cursor) opts.cursor = cursor;
                const result = await UQDATA.list(opts);
                keys.push(...result.keys.map(k => k.name));
                cursor = result.list_complete ? undefined : result.cursor;
            } while (cursor);
            return keys;
        }

        async function fetchKeys(keys) {
            const results = [];
            for (let i = 0; i < keys.length; i += 50) {
                const batch  = keys.slice(i, i + 50);
                const chunks = await Promise.all(batch.map(k => UQDATA.get(k, { type: 'json' })));
                results.push(...chunks);
            }
            return results;
        }

        let downloads = [], visits = [];

        if (type === 'dl' || type === 'both') {
            // If dateFilter set, only list keys for that date prefix
            const prefix   = dateFilter ? `dl:${dateFilter}` : 'dl:';
            const dlKeys   = await listAllKeys(prefix);
            const dlChunks = await fetchKeys(dlKeys);
            dlChunks.forEach(chunk => { if (Array.isArray(chunk)) downloads.push(...chunk); });
            downloads.sort((a, b) => (b.ts || b.date || '') > (a.ts || a.date || '') ? 1 : -1);
        }

        if (type === 'vt' || type === 'both') {
            const prefix   = dateFilter ? `vt:${dateFilter}` : 'vt:';
            const vtKeys   = await listAllKeys(prefix);
            const vtChunks = await fetchKeys(vtKeys);
            vtChunks.forEach(chunk => { if (Array.isArray(chunk)) visits.push(...chunk); });
            visits.sort((a, b) => (b.ts || b.date || '') > (a.ts || a.date || '') ? 1 : -1);
        }

        return new Response(JSON.stringify({ ok:true, downloads, visits }), { headers:cors });
    } catch(e) {
        return new Response(JSON.stringify({ ok:false, error:e.message }), { status:500, headers:cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }});
}
