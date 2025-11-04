// netlify/functions/group_meta.js — lightweight meta for polling
import { getStore } from "@netlify/blobs";

const STORE_NAME = "groups";
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
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: H });
  try{
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(id||"")) return Response.json({ error:"Bad id" }, { status:400, headers:H });
    const store = getStore(STORE_NAME, STORE_OPTS);
    const data = await store.get(`data:${id}`, { type:"json" });
    if(!data) return Response.json({ error:"Not found" }, { status:404, headers:H });
    return Response.json({ version: Number(data.version||1), updatedAt: data.updatedAt }, { headers:H });
  }catch(e){
    console.error("group_meta error", e);
    return Response.json({ error:"Internal error", detail:String(e?.message||e) }, { status:500, headers:H });
  }
};
