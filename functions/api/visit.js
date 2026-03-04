// functions/api/visit.js
// Tracks page visits from ALL visitors instantly using Cloudflare KV
// KV binding: UQDATA  (Cloudflare Pages → Settings → Functions → KV namespace bindings)

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
        const sulDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
        const sulTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const country = context.request.cf?.country || '';
        const city    = context.request.cf?.city    || '';
        const event   = { date: sulDate, time: sulTime, ts: now.toISOString(), country, city };

        // Store in daily bucket: key "vt:YYYY-MM-DD"
        const key      = `vt:${sulDate}`;
        const existing = await UQDATA.get(key, { type: 'json' }) || [];
        existing.push(event);
        if (existing.length > 10000) existing.splice(0, existing.length - 10000);
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
