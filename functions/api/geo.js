// functions/api/geo.js
// Returns the visitor's country and city from Cloudflare request metadata.
// Called once by index.html on page load — result used for Supabase inserts.
// No KV reads. Instant response.

export async function onRequestGet(context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    };
    return new Response(JSON.stringify({
        country: context.request.cf?.country || '',
        city:    context.request.cf?.city    || ''
    }), { headers });
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }});
}
