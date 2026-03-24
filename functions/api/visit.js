// functions/api/visit.js
// Tracks page visits using Cloudflare KV — hourly buckets to stay under 25MB limit
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

        const now     = new Date();
        const sulDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });       // YYYY-MM-DD
        const sulHour = now.toLocaleString('en-GB',    { timeZone: 'Asia/Baghdad', hour: '2-digit', hour12: false }).replace(/,.*/, '').padStart(2,'0');
        const sulTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const country = context.request.cf?.country || '';
        const city    = context.request.cf?.city    || '';
        const event   = { date: sulDate, time: sulTime, ts: now.toISOString(), country, city };

        // Use hourly buckets: "vt:YYYY-MM-DD:HH" — keeps each value small (max ~few hundred events/hour)
        const key      = `vt:${sulDate}:${sulHour}`;
        const existing = await UQDATA.get(key, { type: 'json' }) || [];
        existing.push(event);
        // Safety cap per hour bucket: 2000 events max
        if (existing.length > 2000) existing.splice(0, existing.length - 2000);
        await UQDATA.put(key, JSON.stringify(existing));

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
