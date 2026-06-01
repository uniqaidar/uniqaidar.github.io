// functions/api/og.js
// Proxies all /api/og requests to the uniqaidar-og Cloudflare Worker.
// The Worker handles PNG generation using resvg-wasm with WASM module support.

const WORKER_URL = 'https://uniqaidar-og.uniqaidar.workers.dev';

export async function onRequestGet(context) {
    const url      = new URL(context.request.url);
    const workerUrl = WORKER_URL + '/?' + url.searchParams.toString();
    const response  = await fetch(workerUrl, {
        headers: { 'User-Agent': context.request.headers.get('User-Agent') || '' }
    });
    return new Response(response.body, {
        status:  response.status,
        headers: response.headers,
    });
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }});
}
