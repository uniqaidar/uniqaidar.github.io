// functions/api/purge.js
// Deletes KV keys for a specific date after they have been archived to GitHub.
// Called by the GitHub Action after a successful archive commit.
// Requires: Authorization: Bearer <ARCHIVE_TOKEN> header
// Body: { "date": "YYYY-MM-DD" }
// KV binding: UQDATA

export async function onRequestPost(context) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };

    try {
        const { UQDATA, ARCHIVE_TOKEN } = context.env;

        if (!UQDATA) {
            return new Response(JSON.stringify({ ok: false, error: 'KV not bound' }), { status: 500, headers: cors });
        }

        // Auth check — ARCHIVE_TOKEN must be set as a Pages secret
        if (ARCHIVE_TOKEN) {
            const auth = context.request.headers.get('Authorization') || '';
            if (auth !== `Bearer ${ARCHIVE_TOKEN}`) {
                return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: cors });
            }
        }

        const body = await context.request.json().catch(() => ({}));
        const date = (body.date || '').trim();

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid or missing date (YYYY-MM-DD)' }), { status: 400, headers: cors });
        }

        // Collect all keys for this date (both hourly and legacy daily format)
        // dl:YYYY-MM-DD:HH  (hourly, new format)
        // vt:YYYY-MM-DD:HH  (hourly, new format)
        // dl:YYYY-MM-DD     (legacy daily, old format)
        // vt:YYYY-MM-DD     (legacy daily, old format)
        const prefixes = [`dl:${date}`, `vt:${date}`];
        const keysToDelete = [];

        for (const prefix of prefixes) {
            let cursor;
            do {
                const opts = { prefix, limit: 1000 };
                if (cursor) opts.cursor = cursor;
                const result = await UQDATA.list(opts);
                keysToDelete.push(...result.keys.map(k => k.name));
                cursor = result.list_complete ? undefined : result.cursor;
            } while (cursor);
        }

        if (keysToDelete.length === 0) {
            return new Response(JSON.stringify({ ok: true, deleted: 0, message: `No KV keys found for ${date}` }), { headers: cors });
        }

        // Delete all found keys
        await Promise.all(keysToDelete.map(k => UQDATA.delete(k)));

        return new Response(JSON.stringify({
            ok: true,
            deleted: keysToDelete.length,
            keys: keysToDelete,
            date
        }), { headers: cors });

    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
    }
}

export async function onRequestOptions() {
    return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }});
}
