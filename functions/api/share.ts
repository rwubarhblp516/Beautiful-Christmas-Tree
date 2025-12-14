
interface Env {
    TREE_KV: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;

    // Validate KV binding
    if (!env.TREE_KV) {
        return new Response(JSON.stringify({ error: 'KV binding TREE_KV not found' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const payload = await request.json<any>();

        // Simple validation
        if (!payload || !payload.images || !Array.isArray(payload.images)) {
            return new Response(JSON.stringify({ error: 'Invalid payload' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Generate ID
        const id = crypto.randomUUID();

        // Store in KV (expiration turned off for now, or maybe 30 days?)
        // Set 30 days expiration for now to be safe, or just persistent. Let's make it persistent.
        await env.TREE_KV.put(id, JSON.stringify(payload));

        return new Response(JSON.stringify({ id, success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
