import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// ---------- me ----------
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const roleList: string[] = (roles ?? []).map((r: any) => r.role);
    return {
      userId,
      profile,
      roles: roleList,
      isAdmin: roleList.includes("admin"),
      isStaff: roleList.includes("staff"),
    };
  });

export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_admin_if_none", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    return { claimed: data as boolean };
  });

// ---------- facilities & floors ----------
export const listFacilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("facilities")
      .select("id,name,timezone,floors(id,name)")
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const createFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; timezone?: string }) =>
    z.object({ name: z.string().min(1).max(120), timezone: z.string().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("facilities").insert({ name: data.name, timezone: data.timezone ?? "America/Chicago" }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createFloor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { facility_id: string; name: string }) =>
    z.object({ facility_id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("floors").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- rooms ----------
export const listRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("rooms")
      .select("id,room_number,qr_token,floor_id,floors(id,name,facility_id,facilities(id,name))")
      .order("room_number");
    if (error) throw new Error(error.message);
    return data;
  });

export const bulkAddRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { floor_id: string; start: number; end: number; prefix?: string }) =>
    z.object({
      floor_id: z.string().uuid(),
      start: z.number().int().min(0).max(9999),
      end: z.number().int().min(0).max(9999),
      prefix: z.string().max(10).optional(),
    }).refine((v) => v.end >= v.start && v.end - v.start <= 500, { message: "Range must be ascending and at most 500 rooms at a time" }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const rows: any[] = [];
    for (let n = data.start; n <= data.end; n++) {
      rows.push({ floor_id: data.floor_id, room_number: `${data.prefix ?? ""}${n}` });
    }
    const { data: inserted, error } = await context.supabase.from("rooms").insert(rows).select();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("rooms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- NFC tag links ----------
export const listRoomNfcTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("room_nfc_tags")
      .select("id,tag_uid,label,created_at,room_id,rooms(id,room_number,floors(name,facilities(name)))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const linkRoomNfcTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { room_id: string; tag_uid: string; label?: string }) =>
    z.object({
      room_id: z.string().uuid(),
      tag_uid: z.string().min(2).max(120),
      label: z.string().max(80).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const tag = data.tag_uid.trim();
    const normalized = tag.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
    if (!normalized) throw new Error("That tag serial number is empty or unreadable.");
    const { data: existing } = await context.supabase
      .from("room_nfc_tags")
      .select("id,room_id,rooms(room_number)")
      .eq("tag_uid_normalized", normalized)
      .maybeSingle();
    if (existing) {
      if (existing.room_id === data.room_id) return { ok: true, id: existing.id, moved: false };
      const { error: uErr } = await context.supabase
        .from("room_nfc_tags")
        .update({ room_id: data.room_id, tag_uid: tag, label: data.label ?? null })
        .eq("id", existing.id);
      if (uErr) throw new Error(uErr.message);
      return { ok: true, id: existing.id, moved: true };
    }
    const { data: row, error } = await context.supabase
      .from("room_nfc_tags")
      .insert({ room_id: data.room_id, tag_uid: tag, label: data.label ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id, moved: false };
  });

export const unlinkRoomNfcTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("room_nfc_tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- round schedules ----------
export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("round_schedules")
      .select("*,floors(id,name,facility_id,facilities(id,name))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    floor_id: string;
    shift_name: string;
    shift_start_time: string; // 'HH:MM'
    frequency_hours: number;
    grace_minutes: number;
    rounds_per_shift: number;
  }) =>
    z.object({
      floor_id: z.string().uuid(),
      shift_name: z.string().min(1).max(80),
      shift_start_time: z.string().regex(/^\d{2}:\d{2}$/),
      frequency_hours: z.number().positive().max(12),
      grace_minutes: z.number().int().min(1).max(120),
      rounds_per_shift: z.number().int().min(1).max(12),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    // Deactivate any prior active schedule for this floor
    await context.supabase.from("round_schedules").update({ active: false })
      .eq("floor_id", data.floor_id).eq("active", true);
    const { data: row, error } = await context.supabase.from("round_schedules").insert({
      floor_id: data.floor_id,
      shift_name: data.shift_name,
      shift_start_time: data.shift_start_time + ":00",
      frequency: `${data.frequency_hours} hours`,
      grace: `${data.grace_minutes} minutes`,
      rounds_per_shift: data.rounds_per_shift,
      active: true,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- staff ----------
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id,full_name,employee_id,email,active,floor_id,facility_id")
      .order("full_name");
    if (error) throw new Error(error.message);
    const { data: roles, error: rErr } = await context.supabase.from("user_roles").select("user_id,role");
    if (rErr) throw new Error(rErr.message);
    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    }
    return (data ?? []).map((p: any) => ({ ...p, user_roles: (byUser.get(p.id) ?? []).map((role) => ({ role })) }));
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name: string; employee_id?: string; role: "admin" | "staff"; floor_id?: string; facility_id?: string }) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(8).max(72),
      full_name: z.string().min(1).max(120),
      employee_id: z.string().max(50).optional(),
      role: z.enum(["admin", "staff"]),
      floor_id: z.string().uuid().optional(),
      facility_id: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();
    const fullName = data.full_name.trim();
    const employeeId = data.employee_id?.trim() || null;
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    let uid = created.user?.id;
    if (cErr) {
      if (!/already|registered|exists/i.test(cErr.message)) throw new Error(cErr.message);
      const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) throw new Error(listErr.message);
      const existing = userList.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) throw new Error("Account exists but could not be located. Try password reset.");
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (updateErr) throw new Error(updateErr.message);
      uid = existing.id;
    }
    if (!uid) throw new Error("Could not create staff account");
    await supabaseAdmin.from("profiles").upsert({
      id: uid, full_name: fullName, employee_id: employeeId, email, active: true,
      floor_id: data.floor_id ?? null, facility_id: data.facility_id ?? null,
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: data.role });
    return { ok: true, id: uid };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("profiles").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateStaffAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; floor_id: string | null; facility_id: string | null }) =>
    z.object({
      id: z.string().uuid(),
      floor_id: z.string().uuid().nullable(),
      facility_id: z.string().uuid().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("profiles")
      .update({ floor_id: data.floor_id, facility_id: data.facility_id })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; password: string }) =>
    z.object({ id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const password = data.password.trim();
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password, email_confirm: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ANTI-CHEAT SCAN ----------
export const submitRoundScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { qr_token: string; input_method?: "qr" | "nfc" }) =>
    z.object({
      qr_token: z.string().min(1).max(200),
      input_method: z.enum(["qr", "nfc"]).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const match = data.qr_token.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const token = match ? match[1] : data.qr_token;
    const method = data.input_method ?? "qr";
    const { data: result, error } = await context.supabase.rpc("submit_round_scan", {
      p_qr_token: token,
      p_input_method: method,
    });
    if (error) throw new Error(error.message);
    const r = result as any;
    if (r && r.ok === false) {
      await logScanError({
        userId: context.userId, token, room_id: null,
        code: r.code, title: r.title, message: r.message, dry_run: false,
      });
    }
    return r as {
      ok: boolean;
      code: string;
      title: string;
      message?: string;
      room_number?: string;
      round_index?: number;
      completed_at?: string;
      next_window_starts?: string;
      dry_run?: boolean;
    };
  });


// Admin-only dry-run scan: never writes to scan_logs.
export const submitRoundScanDryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { qr_token: string }) =>
    z.object({ qr_token: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const match = data.qr_token.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const token = match ? match[1] : data.qr_token;
    const { data: result, error } = await context.supabase.rpc("submit_round_scan", {
      p_qr_token: token,
      p_dry_run: true,
    });
    if (error) throw new Error(error.message);
    const r = result as any;
    if (r && r.ok === false) {
      await logScanError({
        userId: context.userId, token, room_id: null,
        code: r.code, title: r.title, message: r.message, dry_run: true,
      });
    }
    return r as Record<string, any>;
  });

// Fire-and-forget error logger; never blocks the scan response.
async function logScanError(opts: {
  userId: string;
  token: string;
  room_id: string | null;
  code: string;
  title?: string;
  message?: string;
  dry_run: boolean;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("scan_error_logs").insert({
      user_id: opts.userId,
      qr_token: opts.token,
      room_id: opts.room_id,
      code: opts.code,
      title: opts.title ?? null,
      message: opts.message ?? null,
      dry_run: opts.dry_run,
    });
  } catch (e) {
    console.error("logScanError failed:", e);
  }
}

// Admin: failure counts by code and recent error rows.
export const getScanErrorSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hours?: number; include_dry_run?: boolean }) =>
    z.object({
      hours: z.number().int().min(1).max(24 * 30).optional(),
      include_dry_run: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const hours = data.hours ?? 24;
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    let q = context.supabase
      .from("scan_error_logs")
      .select("code, dry_run, created_at")
      .gte("created_at", since);
    if (!data.include_dry_run) q = q.eq("dry_run", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of rows ?? []) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
    const by_code = Array.from(counts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
    return { hours, total: rows?.length ?? 0, by_code };
  });

export const listRecentScanErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; include_dry_run?: boolean }) =>
    z.object({
      limit: z.number().int().min(1).max(500).optional(),
      include_dry_run: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    let q = context.supabase
      .from("scan_error_logs")
      .select("id, created_at, code, title, message, dry_run, user_id, qr_token")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (!data.include_dry_run) q = q.eq("dry_run", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter((x): x is string => !!x)));
    let profileMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name, email").in("id", userIds);
      for (const p of profs ?? []) profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
    return (rows ?? []).map((r) => ({ ...r, profiles: r.user_id ? profileMap.get(r.user_id) ?? null : null }));
  });


// ---------- READS for UI ----------
export const getFloorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { floor_id: string }) => z.object({ floor_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_floor_status", { p_floor_id: data.floor_id });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Staff home: just identity + a small personal count of today's scans.
export const getMyStaffHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("full_name,email").eq("id", context.userId).maybeSingle();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const { count } = await context.supabase
      .from("scan_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("completed_at", dayStart.toISOString());
    return {
      full_name: profile?.full_name ?? profile?.email ?? "",
      scans_today: count ?? 0,
    };
  });

// Staff dashboard: upcoming rounds, completed check-ins and my scan history grouped by round.
export const getMyStaffDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("full_name,email,facility_id").eq("id", userId).maybeSingle();

    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

    // Floors in my facility (fall back to all readable floors when unassigned).
    let floorQuery = supabase.from("floors").select("id,name");
    if (profile?.facility_id) floorQuery = floorQuery.eq("facility_id", profile.facility_id);
    const { data: floors } = await floorQuery;

    type Item = {
      room_id: string; room_number: string; floor: string; status: string;
      round_index: number; scheduled_for: string; completed_at: string | null; completed_by: string | null;
    };
    const items: Item[] = [];
    for (const f of (floors ?? []) as any[]) {
      const { data: rows } = await supabase.rpc("get_floor_status", { p_floor_id: f.id });
      for (const r of (rows ?? []) as any[]) items.push({ ...r, floor: f.name });
    }

    const upcoming = items
      .filter((i) => i.status === "active" || i.status === "upcoming" || i.status === "overdue")
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));

    // My scans today, newest first, with room numbers.
    const { data: myScans } = await supabase
      .from("scan_logs")
      .select("id,room_id,round_index,shift_label,scheduled_for,completed_at,late_minutes,input_method")
      .eq("user_id", userId)
      .gte("completed_at", dayStart.toISOString())
      .order("completed_at", { ascending: false });

    const roomIds = [...new Set((myScans ?? []).map((s: any) => s.room_id))];
    const roomMap = new Map<string, string>();
    if (roomIds.length) {
      const { data: rooms } = await supabase.from("rooms").select("id,room_number").in("id", roomIds);
      for (const r of (rooms ?? []) as any[]) roomMap.set(r.id, r.room_number);
    }

    const groups = new Map<string, {
      key: string; round_index: number; shift_label: string; scheduled_for: string;
      scans: { id: string; room_number: string; completed_at: string; late_minutes: number; input_method: string }[];
    }>();
    for (const s of (myScans ?? []) as any[]) {
      const key = `${s.shift_label}#${s.round_index}#${s.scheduled_for}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key, round_index: s.round_index, shift_label: s.shift_label,
          scheduled_for: s.scheduled_for, scans: [],
        });
      }
      groups.get(key)!.scans.push({
        id: s.id,
        room_number: roomMap.get(s.room_id) ?? "—",
        completed_at: s.completed_at,
        late_minutes: s.late_minutes ?? 0,
        input_method: s.input_method ?? "qr",
      });
    }

    return {
      full_name: profile?.full_name ?? profile?.email ?? "",
      scans_today: (myScans ?? []).length,
      completed_rooms_today: items.filter((i) => i.status === "completed").length,
      due_now: items.filter((i) => i.status === "active").length,
      overdue: items.filter((i) => i.status === "overdue").length,
      upcoming: upcoming.slice(0, 25),
      rounds: [...groups.values()].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for)),
    };
  });

export const getRoundReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { floor_id: string; from: string; to: string; status?: string; user_id?: string }) =>
    z.object({
      floor_id: z.string().uuid(),
      from: z.string(),
      to: z.string(),
      status: z.enum(["all", "completed", "overdue", "upcoming"]).optional(),
      user_id: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("get_round_report", {
      p_floor_id: data.floor_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    let result = rows ?? [];
    if (data.status && data.status !== "all") result = result.filter((r: any) => r.status === data.status);
    if (data.user_id) {
      // Filter by employee — match against the employee_name's corresponding user via separate lookup.
      // For simplicity here, filter by employee_name matching the chosen user's profile.full_name.
      const { data: p } = await context.supabase.from("profiles").select("full_name").eq("id", data.user_id).maybeSingle();
      if (p?.full_name) result = result.filter((r: any) => r.employee_name === p.full_name);
    }
    return result;
  });

// Dashboard stats: today's totals across all floors visible to the admin.
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data: floors, error: fErr } = await context.supabase.from("floors").select("id,name");
    if (fErr) throw new Error(fErr.message);
    let totalDue = 0, completed = 0, overdue = 0, active = 0, upcoming = 0;
    const overdueRooms: { room_number: string; floor: string; scheduled_for: string }[] = [];
    for (const f of floors ?? []) {
      const { data: rows } = await context.supabase.rpc("get_floor_status", { p_floor_id: f.id });
      for (const r of (rows ?? []) as any[]) {
        totalDue++;
        if (r.status === "completed") completed++;
        else if (r.status === "overdue") { overdue++; overdueRooms.push({ room_number: r.room_number, floor: f.name, scheduled_for: r.scheduled_for }); }
        else if (r.status === "active") active++;
        else upcoming++;
      }
    }
    // Late minutes: average for today's completed scans
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const { data: lateRows } = await context.supabase
      .from("scan_logs").select("late_minutes,user_id,profiles(full_name,employee_id)")
      .gte("completed_at", dayStart.toISOString());
    const late = (lateRows ?? []).filter((r: any) => r.late_minutes > 0).length;
    const compliance = totalDue ? Math.round((completed / totalDue) * 100) : 0;

    // Employee performance (today)
    const empMap = new Map<string, { name: string; emp: string; completed: number; late: number }>();
    for (const r of (lateRows ?? []) as any[]) {
      const key = r.user_id;
      const e = empMap.get(key) ?? { name: r.profiles?.full_name ?? "—", emp: r.profiles?.employee_id ?? "", completed: 0, late: 0 };
      e.completed++;
      if (r.late_minutes > 0) e.late++;
      empMap.set(key, e);
    }
    const perEmployee = Array.from(empMap.values()).sort((a, b) => b.completed - a.completed);

    return { totalDue, completed, overdue, active, upcoming, late, compliance, overdueRooms, perEmployee };
  });

// ---------- PointClickCare integration (scaffold) ----------

export const listPccLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("pcc_task_links")
      .select("id, room_id, pcc_patient_id, pcc_task_id, updated_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertPccLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { room_id: string; pcc_patient_id?: string | null; pcc_task_id?: string | null }) =>
    z.object({
      room_id: z.string().uuid(),
      pcc_patient_id: z.string().max(120).nullish(),
      pcc_task_id: z.string().max(120).nullish(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const patient = data.pcc_patient_id?.trim() || null;
    const task = data.pcc_task_id?.trim() || null;
    // If both blank, delete the row instead of storing empty mapping.
    if (!patient && !task) {
      const { error } = await context.supabase.from("pcc_task_links").delete().eq("room_id", data.room_id);
      if (error) throw new Error(error.message);
      return { ok: true, deleted: true };
    }
    const { error } = await context.supabase
      .from("pcc_task_links")
      .upsert({ room_id: data.room_id, pcc_patient_id: patient, pcc_task_id: task }, { onConflict: "room_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reports which PCC secrets are configured (never returns the values).
export const getPccIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    return {
      api_base_set: !!process.env.PCC_API_BASE,
      client_id_set: !!process.env.PCC_CLIENT_ID,
      client_secret_set: !!process.env.PCC_CLIENT_SECRET,
    };
  });
