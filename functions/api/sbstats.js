// functions/api/sbstats.js
// Server-side Supabase query — reads downloads and visits from Supabase
// using the service_role key stored as a Cloudflare Pages secret (SUPABASE_SERVICE_KEY).
// The browser never sees the service_role key.
// Required Cloudflare Pages secret: SUPABASE_SERVICE_KEY
// Optional: ADMIN_TOKEN (same bearer token used by /api/stats)

const SUPABASE_URL = 'https://jmzydiwerjqccjuwegcb.supabase.co';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

export async function onRequestGet(context) {
    try {
        const { SUPABASE_SERVICE_KEY, ADMIN_TOKEN } = context.env;

        if (!SUPABASE_SERVICE_KEY) {
            return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_SERVICE_KEY not configured' }), { status: 500, headers: CORS });
        }

        if (ADMIN_TOKEN) {
            const auth = context.request.headers.get('Authorization') || '';
            if (auth !== `Bearer ${ADMIN_TOKEN}`) {
                return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: CORS });
            }
        }

        const url  = new URL(context.request.url);
        const date = url.searchParams.get('date') || null;

        const headers = {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
        };

        async function sbSelect(table) {
            let endpoint = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=ts.desc`;
            if (date) endpoint += `&date=eq.${date}`;
            const r = await fetch(endpoint, { headers });
            if (!r.ok) {
                const err = await r.text();
                throw new Error(`Supabase ${table}: ${r.status} ${err}`);
            }
            return r.json();
        }

        const [downloads, visits] = await Promise.all([
            sbSelect('downloads'),
            sbSelect('visits')
        ]);

        return new Response(JSON.stringify({ ok: true, downloads, visits }), { headers: CORS });

    } catch(e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }});
}
