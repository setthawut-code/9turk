// netlify/functions/group.js
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export async function handler(event) {
  try {
    const store = getStore({ name: "groups" });
    const url = new URL(
      event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`
    );
    const m = event.httpMethod;

    if (m === "OPTIONS") return json({ ok: true });

    if (m === "POST") {
      const id = crypto.randomBytes(6).toString("base64url");
      const writeKey = crypto.randomBytes(16).toString("base64url");
      await store.setJSON(`meta:${id}`, { writeKeyHash: sha(writeKey), createdAt: Date.now() });
      await store.setJSON(`data:${id}`, { version: 1, updatedAt: Date.now(), payload: null });
      return json({ id, writeKey });
    }

    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing id" }, 400);

    if (m === "GET") {
      const data = await store.getJSON(`data:${id}`);
      if (!data) return json({ error: "Not found" }, 404);
      return json(data);
    }

    if (m === "PUT") {
      const provided = event.headers["x-write-key"] || event.headers["X-Write-Key"] || "";
      const meta = await store.getJSON(`meta:${id}`);
      if (!meta) return json({ error: "Not found" }, 404);
      if (!safeEq(sha(provided), meta.writeKeyHash)) return json({ error: "Forbidden" }, 403);

      let body = null; try { body = JSON.parse(event.body || "{}"); } catch {}
      if (!body || typeof body.payload === "undefined") return json({ error: "Bad payload" }, 400);

      await store.setJSON(`data:${id}`, {
        version: Number(body.version || 1),
        updatedAt: Date.now(),
        payload: body.payload,
      });
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("group.js error", e);
    return json({ error: "Internal error", detail: String(e?.message || e) }, 500);
  }
}

function json(obj, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-write-key",
    },
    body: JSON.stringify(obj),
  };
}
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
