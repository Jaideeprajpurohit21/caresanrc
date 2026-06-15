// Fire-and-forget PointClickCare notifier.
// Called by a database trigger on every INSERT into public.scan_logs.
// Until PCC credentials and a per-room mapping exist, this function does
// nothing visible. It MUST always return 2xx so the database trigger never
// blocks or delays the round-scan confirmation seen by the caregiver.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional PCC credentials — set later via project secrets.
const PCC_API_BASE = Deno.env.get("PCC_API_BASE");
const PCC_CLIENT_ID = Deno.env.get("PCC_CLIENT_ID");
const PCC_CLIENT_SECRET = Deno.env.get("PCC_CLIENT_SECRET");

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return ok();

    const payload = await req.json().catch(() => ({}));
    // Supabase database-webhook payload shape: { type, table, record, ... }
    const record = payload?.record ?? payload;
    const roomId = record?.room_id;
    const completedAt = record?.completed_at;

    if (!roomId) {
      console.log("[pcc] no room_id on payload, skipping");
      return ok({ ok: true, skipped: "no_room_id" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: link, error } = await admin
      .from("pcc_task_links")
      .select("pcc_patient_id, pcc_task_id")
      .eq("room_id", roomId)
      .maybeSingle();

    if (error) {
      console.error("[pcc] mapping lookup failed", error);
      return ok({ ok: true, skipped: "lookup_error" });
    }

    if (!link?.pcc_patient_id || !link?.pcc_task_id) {
      console.log("[pcc] no mapping for room, skipping", roomId);
      return ok({ ok: true, skipped: "no_mapping" });
    }

    if (!PCC_API_BASE || !PCC_CLIENT_ID || !PCC_CLIENT_SECRET) {
      console.log("[pcc] credentials not configured, skipping");
      return ok({ ok: true, skipped: "not_configured" });
    }

    // TODO: fill in from PointClickCare API docs once developer access is granted.
    // The path and payload shape below are placeholders. Do NOT trust them.
    try {
      const res = await fetch(`${PCC_API_BASE}/<placeholder-path>`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // TODO: real PCC auth (likely OAuth2 client_credentials → bearer token).
          "x-client-id": PCC_CLIENT_ID,
          "x-client-secret": PCC_CLIENT_SECRET,
        },
        body: JSON.stringify({
          patientId: link.pcc_patient_id,
          taskId: link.pcc_task_id,
          completedAt,
        }),
      });
      if (!res.ok) {
        console.error("[pcc] upstream non-2xx", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[pcc] upstream call failed", err);
    }

    return ok({ ok: true });
  } catch (err) {
    console.error("[pcc] unexpected error", err);
    // Always return 2xx — never block the scan trigger.
    return ok({ ok: true, error: String(err) });
  }
});
