// functions/api/stats.js
// Admin panel reads ALL stats from KV through this endpoint
// Requires: Authorization header with the admin token (same token stored in admin localStorage)
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

        // Simple token auth — optional but recommended
        if (ADMIN_TOKEN) {
            const auth = context.request.headers.get('Authorization') || '';
            if (auth !== `Bearer ${ADMIN_TOKEN}`) {
                return new Response(JSON.stringify({ ok:false, error:'Unauthorized' }), { status:401, headers:cors });
            }
        }

        const url    = new URL(context.request.url);
        const days   = Math.min(parseInt(url.searchParams.get('days') || '30'), 400);
        const type   = url.searchParams.get('type') || 'both'; // 'dl', 'vt', 'both'

        // Build date list for the requested range
        const dates = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }

        let downloads = [], visits = [];

        if (type === 'dl' || type === 'both') {
            const dlKeys   = dates.map(d => `dl:${d}`);
            const dlChunks = await Promise.all(dlKeys.map(k => UQDATA.get(k, { type:'json' })));
            dlChunks.forEach(chunk => { if (Array.isArray(chunk)) downloads.push(...chunk); });
        }

        if (type === 'vt' || type === 'both') {
            const vtKeys   = dates.map(d => `vt:${d}`);
            const vtChunks = await Promise.all(vtKeys.map(k => UQDATA.get(k, { type:'json' })));
            vtChunks.forEach(chunk => { if (Array.isArray(chunk)) visits.push(...chunk); });
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
