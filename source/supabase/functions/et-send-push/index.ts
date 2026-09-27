import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.96.0";
import webpush from "npm:web-push@3.6.7";

const origin = "https://beamd-endonutri.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let body: { broadcastId?: string; scheduled?: boolean };
  try { body = await request.json() } catch { return reply({ error: "Invalid body" }, 400) }

  const broadcastId = body.broadcastId ?? "";
  const scheduled = body.scheduled === true;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(broadcastId)) return reply({ error: "Invalid broadcast" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { data: broadcast } = await admin.from("et_broadcasts").select("id,created_by,created_at,scheduled_source_id,push_sent_at").eq("id", broadcastId).single();
  if (!broadcast) return reply({ error: "Broadcast unavailable" }, 404);
  const ageMs = Date.now() - new Date(broadcast.created_at).getTime();

  if (scheduled) {
    if (!broadcast.scheduled_source_id || ageMs < 0 || ageMs > 5 * 60 * 1000) return reply({ error: "Scheduled broadcast unavailable" }, 403);
  } else {
    if (request.headers.get("Origin") !== origin) return reply({ error: "Invalid origin" }, 403);
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return reply({ error: "Login required" }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: "Invalid session" }, 401);
    const { data: supervisor } = await admin.from("et_staff").select("id").eq("user_id", auth.user.id).eq("role", "supervisor").eq("active", true).single();
    if (!supervisor) return reply({ error: "Supervisor required" }, 403);
    if (broadcast.created_by !== auth.user.id || ageMs < 0 || ageMs > 2 * 60 * 1000) return reply({ error: "Broadcast unavailable" }, 403);
  }

  if (broadcast.push_sent_at) return reply({ sent: 0, alreadySent: true });

  const { data: recipients, error: recipientError } = await admin.from("et_broadcast_recipients").select("staff_id,et_staff(user_id)").eq("broadcast_id", broadcastId);
  if (recipientError) return reply({ error: "Could not load recipients" }, 500);
  const userIds = (recipients ?? []).map((r: any) => r.et_staff?.user_id).filter(Boolean);
  if (!userIds.length) {
    await admin.from("et_broadcasts").update({ push_sent_at: new Date().toISOString() }).eq("id", broadcastId).is("push_sent_at", null);
    return reply({ sent: 0 });
  }

  const { data: devices, error: deviceError } = await admin.from("et_push_subscriptions").select("endpoint,p256dh,auth_key").in("user_id", userIds);
  const { data: privateKey, error: keyError } = await admin.rpc("et_push_vapid_private");
  if (deviceError || keyError || !privateKey) return reply({ error: "Push configuration unavailable" }, 500);

  const { data: claimed, error: claimError } = await admin.from("et_broadcasts").update({ push_sent_at: new Date().toISOString() }).eq("id", broadcastId).is("push_sent_at", null).select("id").maybeSingle();
  if (claimError) return reply({ error: "Could not claim broadcast" }, 500);
  if (!claimed) return reply({ sent: 0, alreadySent: true });

  webpush.setVapidDetails("https://github.com/BeaMD-endonutri/ENDOTURNOS-WEB", "BFyvFcSdQ_cLaTEbrh3LEdxm44gHK-U1PJe-AjaFjI9L8QLPVmIRJpN27jDOvWDq5_a8CBoF8q69fr-zdQbDn3c", privateKey);
  const payload = JSON.stringify({ title: "AVISO DE LA JEFA CHICA", body: "Tienes un nuevo aviso en EndoTurnos.", url: "/ENDOTURNOS-WEB/?avisos=1", id: broadcastId });
  const results = await Promise.allSettled((devices ?? []).map(async (device) => {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth_key } }, payload, { TTL: 86400 });
      return true;
    } catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) await admin.from("et_push_subscriptions").delete().eq("endpoint", device.endpoint);
      throw error;
    }
  }));
  return reply({ sent: results.filter(result => result.status === "fulfilled").length, failed: results.filter(result => result.status === "rejected").length });
});
