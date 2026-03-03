// Cloudflare Pages Function — /api/track
// Tracks font downloads from ALL visitors → writes to downloads.json on GitHub
// Environment variables needed (set in Cloudflare Pages → Settings → Environment Variables):
//   GH_TOKEN  = your GitHub personal access token (needs repo write access)
//   GH_USER   = your GitHub username  (e.g. uniqaidar)
//   GH_REPO   = your repo name        (e.g. uniqaidar.github.io)
//   GH_BRANCH = branch name           (e.g. main)

export async function onRequestPost(context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const { GH_TOKEN, GH_USER, GH_REPO, GH_BRANCH = 'main' } = context.env;
        if (!GH_TOKEN || !GH_USER || !GH_REPO) {
            return new Response(JSON.stringify({ ok: false, error: 'Missing env vars' }), { status: 500, headers: corsHeaders });
        }

        const body = await context.request.json();
        const fontName = (body.font || '').slice(0, 200);
        const type     = body.type === 'bulk' ? 'bulk' : 'single';

        const now  = new Date();
        const event = {
            font: fontName,
            type,
            date: now.toISOString().slice(0, 10),
            time: now.toTimeString().slice(0, 8),
            ts:   now.toISOString(),
            ip:   (context.request.headers.get('cf-connecting-ip') || '').slice(0, 15),
            country: context.request.cf?.country || ''
        };

        const apiBase = `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/downloads.json`;
        const ghHeaders = {
            Authorization: `token ${GH_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'UniQaidar-Tracker'
        };

        // Read existing file
        let existing = [], sha = '';
        const getResp = await fetch(`${apiBase}?ref=${GH_BRANCH}`, { headers: ghHeaders });
        if (getResp.ok) {
            const d = await getResp.json();
            sha = d.sha || '';
            try {
                existing = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g, '')))));
                if (!Array.isArray(existing)) existing = [];
            } catch (e) { existing = []; }
        }

        existing.push(event);
        if (existing.length > 10000) existing = existing.slice(existing.length - 10000);

        const putBody = {
            message: `Track download: ${fontName}`,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(existing)))),
            branch: GH_BRANCH
        };
        if (sha) putBody.sha = sha;

        const putResp = await fetch(apiBase, { method: 'PUT', headers: ghHeaders, body: JSON.stringify(putBody) });

        if (putResp.ok) {
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } else {
            const err = await putResp.text();
            return new Response(JSON.stringify({ ok: false, error: err }), { status: 500, headers: corsHeaders });
        }

    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}
