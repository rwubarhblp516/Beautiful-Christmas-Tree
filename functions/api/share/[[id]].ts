
interface Env {
    TREE_KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    const { params, env } = context;
    const id = params.id as string | string[];

    // Handle /api/share/ID or /api/share/[ID]
    const key = Array.isArray(id) ? id[0] : id;

    if (!key) {
        return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400 });
    }

    // Validate KV binding
    if (!env.TREE_KV) {
        return new Response(JSON.stringify({ error: 'KV binding TREE_KV not found' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const value = await env.TREE_KV.get(key);

    if (!value) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(value, {
        headers: { 'Content-Type': 'application/json' },
    });
};
