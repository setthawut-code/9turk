// netlify/functions/group.js — Functions v2 (custom group name + password) with env fallbacks
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Allow both production (auto) and dev/preview via explicit env
const STORE_OPTS = (() => {
  const siteID = process.env.BLOBS_SITE_ID
              || process.env.NETLIFY_SITE_ID
              || process.env.NETLIFY_BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN
              || process.env.NETLIFY_API_TOKEN
              || process.env.NETLIFY_BLOBS_TOKEN;
  return (siteID && token) ? { siteID, token } : {};
})();

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-pass",
  "Content-Type": "application/json",
};

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const validId = (s) => /^[A-Za-z0-9_-]{3,40}$/.test(s || "");
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: H });

  try {
    const url = new URL(req.url);
    const store = getStore({ name: "groups", ...STORE_OPTS });

    // CREATE: POST /api/group  body: { id, pass }
    if (req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch {}
      const id = String(body.id || "").trim();
      const pass = String(body.pass || "");
      if (!validId(id)) return Response.json({ error: "Bad id" }, { status: 400, headers: H });
      if (!pass)       return Response.json({ error: "Missing pass" }, { status: 400, headers: H });

      const metaKey = `meta:${id}`;
      const exists = await store.getJSON(metaKey);
      if (exists) return Response.json({ error: "GroupExists" }, { status: 409, headers: H });

      await store.setJSON(metaKey, { passHash: sha(pass), createdAt: Date.now() });
      await store.setJSON(`data:${id}`, { version: 1, updatedAt: Date.now(), payload: null });
      return Response.json({ id }, { status: 201, headers: H });
    }

    // id from query
    const id = url.searchParams.get("id");
    if (!validId(id)) return Response.json({ error: "Bad id" }, { status: 400, headers: H });

    // must provide password on GET/PUT
    const pass = req.headers.get("x-pass") || "";
    if (!pass) return Response.json({ error: "Missing pass" }, { status: 400, headers: H });

    const meta = await store.getJSON(`meta:${id}`);
    if (!meta) return Response.json({ error: "Not found" }, { status: 404, headers: H });
    if (!safeEq(sha(pass), meta.passHash)) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: H });
    }

    if (req.method === "GET") {
      const data = await store.getJSON(`data:${id}`);
      if (!data) return Response.json({ error: "Not found" }, { status: 404, headers: H });
      return Response.json(data, { headers: H });
    }

    if (req.method === "PUT") {
      let body = {};
      try { body = await req.json(); } catch {}
      if (typeof body.payload === "undefined") {
        return Response.json({ error: "Bad payload" }, { status: 400, headers: H });
      }
      await store.setJSON(`data:${id}`, {
        version: Number(body.version || 1),
        updatedAt: Date.now(),
        payload: body.payload,
      });
      return Response.json({ ok: true }, { headers: H });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers: H });
  } catch (e) {
    console.error("group.js error", e);
    return Response.json({ error: "Internal error", detail: String(e?.message || e) }, { status: 500, headers: H });
  }
};
