// functions/api/track.js
// Tracks font downloads using Cloudflare KV — hourly buckets to stay under 25MB limit
// KV binding: UQDATA

export async function onRequestPost(context) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    try {
        const { UQDATA } = context.env;
        if (!UQDATA) return new Response(JSON.stringify({ ok:false, error:'KV not bound' }), { status:500, headers:cors });

        const body    = await context.request.json();
        const font    = (body.font || '').slice(0, 200);
        // Fix: preserve all type values — 'single', 'bulk', 'cat-bulk'
        const rawType = (body.type || 'single').toString().trim();
        const type    = ['single','bulk','cat-bulk'].includes(rawType) ? rawType : 'single';

        const now     = new Date();
        const sulDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
        const sulHour = now.toLocaleString('en-GB',    { timeZone: 'Asia/Baghdad', hour: '2-digit', hour12: false }).replace(/,.*/, '').padStart(2,'0');
        const sulTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const country = context.request.cf?.country || '';
        const event   = { font, type, date: sulDate, time: sulTime, ts: now.toISOString(), country };

        // Use hourly buckets: "dl:YYYY-MM-DD:HH" — keeps each value small
        const key      = `dl:${sulDate}:${sulHour}`;
        const existing = await UQDATA.get(key, { type: 'json' }) || [];
        existing.push(event);
        // Safety cap per hour bucket: 2000 events max
        if (existing.length > 2000) existing.splice(0, existing.length - 2000);
        await UQDATA.put(key, JSON.stringify(existing), { expirationTtl: 60*60*24*400 });

        return new Response(JSON.stringify({ ok:true }), { headers:cors });
    } catch(e) {
        return new Response(JSON.stringify({ ok:false, error:e.message }), { status:500, headers:cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }});
}
