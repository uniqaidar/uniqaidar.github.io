// functions/api/track.js
// Tracks font downloads with rich metadata — hourly KV buckets
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
        const font    = (body.font  || '').slice(0, 200);
        const rawType = (body.type  || 'single').toString().trim();
        const type    = ['single','bulk','cat-bulk'].includes(rawType) ? rawType : 'single';

        // ── Rich metadata ──
        const device    = (body.device  || 'Unknown').slice(0, 20);
        const source    = (body.source  || 'Direct').slice(0, 80);
        const landingUrl= (body.url     || '').slice(0, 300);
        const eventType = (body.event   || 'download').slice(0, 40); // download | copy_font | copy_category | copy_bulk_modal
        const searchQ   = (body.search  || '').slice(0, 200);

        const now      = new Date();
        const sulDate  = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
        const sulHour  = now.toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', hour12: false }).replace(/,.*/, '').padStart(2,'0');
        const sulTime  = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const country  = context.request.cf?.country || '';
        const city     = context.request.cf?.city    || '';

        const event = {
            font, type, event: eventType,
            date: sulDate, time: sulTime, ts: now.toISOString(),
            country, city,
            device, source, url: landingUrl,
            ...(searchQ ? { search: searchQ } : {})
        };

        const key      = `dl:${sulDate}:${sulHour}`;
        const existing = await UQDATA.get(key, { type: 'json' }) || [];
        existing.push(event);
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
