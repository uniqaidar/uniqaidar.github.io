// functions/api/track.js
// Tracks font downloads from ALL visitors instantly using Cloudflare KV
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

        const body    = await context.request.json();
        const font    = (body.font || '').slice(0, 200);
        const type    = body.type === 'bulk' ? 'bulk' : 'single';
        const now     = new Date();
        const today   = now.toISOString().slice(0, 10);
        const country = context.request.cf?.country || '';
        const event   = { font, type, date: today, time: now.toTimeString().slice(0,8), ts: now.toISOString(), country };

        // Store in daily bucket: key "dl:YYYY-MM-DD"
        const key      = `dl:${today}`;
        const existing = await UQDATA.get(key, { type: 'json' }) || [];
        existing.push(event);
        if (existing.length > 5000) existing.splice(0, existing.length - 5000);
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
