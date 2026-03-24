// functions/api/stats.js
// Admin panel reads ALL stats from KV
// Supports BOTH old daily keys (dl:YYYY-MM-DD, vt:YYYY-MM-DD)
// AND new hourly keys (dl:YYYY-MM-DD:HH, vt:YYYY-MM-DD:HH)
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

        // Optional token auth
        if (ADMIN_TOKEN) {
            const auth = context.request.headers.get('Authorization') || '';
            if (auth !== `Bearer ${ADMIN_TOKEN}`) {
                return new Response(JSON.stringify({ ok:false, error:'Unauthorized' }), { status:401, headers:cors });
            }
        }

        const url  = new URL(context.request.url);
        const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 400);
        const type = url.searchParams.get('type') || 'both';

        // Build list of all date strings for the requested range
        const dates = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
        }

        // Build ALL keys to fetch: both old daily format AND new hourly format
        // Old format: dl:YYYY-MM-DD (one key per day)
        // New format: dl:YYYY-MM-DD:00 through dl:YYYY-MM-DD:23 (24 keys per day)
        function buildKeys(prefix, dateList) {
            const keys = [];
            for (const date of dateList) {
                // Old daily key (backward compat with existing data)
                keys.push(`${prefix}:${date}`);
                // New hourly keys
                for (let h = 0; h < 24; h++) {
                    keys.push(`${prefix}:${date}:${String(h).padStart(2,'0')}`);
                }
            }
            return keys;
        }

        let downloads = [], visits = [];

        // Fetch in batches of 50 to avoid overwhelming KV
        async function fetchKeys(keys) {
            const results = [];
            for (let i = 0; i < keys.length; i += 50) {
                const batch = keys.slice(i, i + 50);
                const chunks = await Promise.all(batch.map(k => UQDATA.get(k, { type: 'json' })));
                results.push(...chunks);
            }
            return results;
        }

        if (type === 'dl' || type === 'both') {
            const dlKeys   = buildKeys('dl', dates);
            const dlChunks = await fetchKeys(dlKeys);
            dlChunks.forEach(chunk => { if (Array.isArray(chunk)) downloads.push(...chunk); });
            // Sort by timestamp descending
            downloads.sort((a, b) => (b.ts || b.date || '') > (a.ts || a.date || '') ? 1 : -1);
        }

        if (type === 'vt' || type === 'both') {
            const vtKeys   = buildKeys('vt', dates);
            const vtChunks = await fetchKeys(vtKeys);
            vtChunks.forEach(chunk => { if (Array.isArray(chunk)) visits.push(...chunk); });
            // Sort by timestamp descending
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
