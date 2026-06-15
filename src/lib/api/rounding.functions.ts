import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
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

// ---------- bootstrap admin ----------
export const claimAdminIfNone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_admin_if_none", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { claimed: data as boolean };
  });

// ---------- facilities/units/floors ----------
export const listFacilityTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("facilities")
      .select("id,name,units(id,name,floors(id,name,rooms(id,room_number,qr_token)))")
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const createFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("facilities").insert({ name: data.name }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { facility_id: string; name: string }) =>
    z.object({ facility_id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("units").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const createFloor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { unit_id: string; name: string }) =>
    z.object({ unit_id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase
      .from("floors").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const bulkAddRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { floor_id: string; start: number; end: number; prefix?: string }) =>
    z.object({
      floor_id: z.string().uuid(),
      start: z.number().int().min(0).max(9999),
      end: z.number().int().min(0).max(9999),
      prefix: z.string().max(10).optional(),
    }).refine((v) => v.end >= v.start && v.end - v.start <= 200, { message: "Invalid range" })
      .parse(d))
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

export const listRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("rooms")
      .select("id,room_number,qr_token,floor_id,floors(id,name,units(id,name,facilities(id,name)))")
      .order("room_number");
    if (error) throw new Error(error.message);
    return data;
  });

// ---------- staff management ----------
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id,full_name,employee_id,email,active,user_roles(role)")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data;
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name: string; employee_id?: string; role: "admin" | "staff" }) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(8).max(72),
      full_name: z.string().min(1).max(120),
      employee_id: z.string().max(50).optional(),
      role: z.enum(["admin", "staff"]),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (cErr) throw new Error(cErr.message);
    const uid = created.user!.id;
    // ensure profile (trigger creates it but make sure employee_id is set)
    await supabaseAdmin.from("profiles").upsert({
      id: uid, full_name: data.full_name, employee_id: data.employee_id ?? null, email: data.email, active: true,
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

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; password: string }) =>
    z.object({ id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- shifts ----------
export const listShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shifts")
      .select("*,facilities(name)")
      .order("start_time");
    if (error) throw new Error(error.message);
    return data;
  });

export const createShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      facility_id: z.string().uuid(),
      name: z.string().min(1).max(80),
      start_time: z.string(),
      end_time: z.string(),
      rounding_interval_minutes: z.number().int().min(15).max(720),
      grace_minutes: z.number().int().min(1).max(120),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: row, error } = await context.supabase.from("shifts").insert(data).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

// Assign staff to shift for a date; generates rounding_tasks for ALL rooms in the facility.
export const assignShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shift_id: string; user_id: string; shift_date: string }) =>
    z.object({
      shift_id: z.string().uuid(),
      user_id: z.string().uuid(),
      shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { data: shift, error: sErr } = await context.supabase
      .from("shifts").select("*").eq("id", data.shift_id).single();
    if (sErr || !shift) throw new Error(sErr?.message ?? "Shift not found");

    // compute starts_at / ends_at in UTC from shift_date + shift times (server time zone assumed)
    const startsAt = new Date(`${data.shift_date}T${shift.start_time}`);
    let endsAt = new Date(`${data.shift_date}T${shift.end_time}`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000); // overnight

    const { data: assignment, error: aErr } = await context.supabase
      .from("shift_assignments")
      .upsert(
        { shift_id: data.shift_id, user_id: data.user_id, shift_date: data.shift_date,
          starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() },
        { onConflict: "shift_id,user_id,shift_date" })
      .select().single();
    if (aErr) throw new Error(aErr.message);

    // Find rooms in facility
    const { data: rooms, error: rErr } = await context.supabase
      .from("rooms")
      .select("id,floors!inner(units!inner(facility_id))")
      .eq("floors.units.facility_id", shift.facility_id);
    if (rErr) throw new Error(rErr.message);

    // Compute scheduled times: first round is shift_start + interval
    const interval = shift.rounding_interval_minutes * 60 * 1000;
    const grace = shift.grace_minutes * 60 * 1000;
    const times: Date[] = [];
    for (let t = startsAt.getTime() + interval; t <= endsAt.getTime(); t += interval) {
      times.push(new Date(t));
    }
    if (times.length === 0) return { assignment, tasks_created: 0 };

    // Clear any previous tasks for this assignment before regenerating
    await context.supabase.from("rounding_tasks").delete().eq("shift_assignment_id", assignment.id);

    const taskRows: any[] = [];
    for (const room of rooms ?? []) {
      for (const t of times) {
        taskRows.push({
          shift_assignment_id: assignment.id,
          room_id: room.id,
          scheduled_at: t.toISOString(),
          window_end: new Date(t.getTime() + grace).toISOString(),
        });
      }
    }
    if (taskRows.length) {
      // Chunk insert to be safe
      for (let i = 0; i < taskRows.length; i += 500) {
        const chunk = taskRows.slice(i, i + 500);
        const { error: tErr } = await context.supabase.from("rounding_tasks").insert(chunk);
        if (tErr) throw new Error(tErr.message);
      }
    }
    return { assignment, tasks_created: taskRows.length };
  });

// ---------- staff: today's tasks ----------
async function sweepOverdue(supabase: any, userId: string) {
  await supabase
    .from("rounding_tasks")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("window_end", new Date().toISOString())
    .in(
      "shift_assignment_id",
      (await supabase.from("shift_assignments").select("id").eq("user_id", userId)).data?.map((r: any) => r.id) ?? [],
    );
}

export const getMyTasksToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await sweepOverdue(supabase, userId);

    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

    const { data: assignments, error: aErr } = await supabase
      .from("shift_assignments")
      .select("id,starts_at,ends_at,shifts(name,grace_minutes)")
      .eq("user_id", userId)
      .gte("starts_at", new Date(dayStart.getTime() - 24 * 3600 * 1000).toISOString())
      .lte("starts_at", dayEnd.toISOString());
    if (aErr) throw new Error(aErr.message);

    const ids = (assignments ?? []).map((a: any) => a.id);
    if (ids.length === 0) return { assignments: [], tasks: [] };

    const { data: tasks, error: tErr } = await supabase
      .from("rounding_tasks")
      .select("id,scheduled_at,window_end,status,completed_at,room_id,shift_assignment_id,rooms(id,room_number,floors(name,units(name)))")
      .in("shift_assignment_id", ids)
      .order("scheduled_at");
    if (tErr) throw new Error(tErr.message);

    return { assignments, tasks };
  });

// ---------- SCAN (the anti-cheat core) ----------
export const scanRoomQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { qr_token: string; device_user_agent?: string }) =>
    z.object({
      qr_token: z.string().min(1).max(200),
      device_user_agent: z.string().max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ua = data.device_user_agent ?? "";

    // Accept either bare uuid or rounding://room/<uuid>
    const match = data.qr_token.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const token = match ? match[1] : data.qr_token;

    const logScan = async (room_id: string | null, task_id: string | null, result: string) => {
      await supabase.from("scan_logs").insert({
        room_id, task_id, user_id: userId, device_user_agent: ua, result: result as any,
      });
    };

    const { data: room } = await supabase
      .from("rooms")
      .select("id,room_number,floors(name,units(name,facilities(id,name)))")
      .eq("qr_token", token).maybeSingle();

    if (!room) {
      await logScan(null, null, "invalid_qr");
      return { ok: false as const, code: "invalid_qr", message: "Invalid QR code" };
    }

    // Active assignment now
    const nowIso = new Date().toISOString();
    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("id,shifts(name,facility_id)")
      .eq("user_id", userId)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso);

    const assignment = assignments?.[0];
    if (!assignment) {
      await logScan(room.id, null, "no_assignment");
      return { ok: false as const, code: "no_assignment", message: "You have no active shift right now." };
    }

    // Lazy-mark overdue for this assignment+room
    await supabase.from("rounding_tasks").update({ status: "overdue" })
      .eq("status", "pending").eq("shift_assignment_id", assignment.id).eq("room_id", room.id)
      .lt("window_end", nowIso);

    // Active task right now
    const { data: activeTask } = await supabase
      .from("rounding_tasks")
      .select("*")
      .eq("shift_assignment_id", assignment.id)
      .eq("room_id", room.id)
      .lte("scheduled_at", nowIso)
      .gte("window_end", nowIso)
      .order("scheduled_at", { ascending: false })
      .maybeSingle();

    if (activeTask) {
      if (activeTask.status === "completed") {
        await logScan(room.id, activeTask.id, "duplicate");
        return { ok: false as const, code: "duplicate", message: "This round is already completed." };
      }
      // Complete it
      const { error: uErr } = await supabase
        .from("rounding_tasks")
        .update({ status: "completed", completed_at: nowIso, completed_by: userId })
        .eq("id", activeTask.id)
        .eq("status", "pending");
      if (uErr) throw new Error(uErr.message);
      await logScan(room.id, activeTask.id, "success");

      const { data: profile } = await supabase.from("profiles").select("full_name,employee_id").eq("id", userId).maybeSingle();
      return {
        ok: true as const,
        message: "Round Completed Successfully",
        room_number: room.room_number,
        scheduled_at: activeTask.scheduled_at,
        completed_at: nowIso,
        employee_name: profile?.full_name ?? "",
        employee_id: profile?.employee_id ?? "",
        shift: (assignment.shifts as any)?.name ?? "",
      };
    }

    // No active task — figure out which case
    const { data: next } = await supabase
      .from("rounding_tasks")
      .select("scheduled_at")
      .eq("shift_assignment_id", assignment.id)
      .eq("room_id", room.id)
      .eq("status", "pending")
      .gt("scheduled_at", nowIso)
      .order("scheduled_at")
      .limit(1).maybeSingle();

    if (next) {
      await logScan(room.id, null, "too_early");
      return { ok: false as const, code: "too_early", message: "Next round is not due yet.", next_at: next.scheduled_at };
    }

    await logScan(room.id, null, "expired");
    return { ok: false as const, code: "expired", message: "This task window has expired." };
  });

// ---------- dashboard ----------
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabase } = context;

    // Sweep overdue across all tasks
    await supabase.from("rounding_tasks").update({ status: "overdue" })
      .eq("status", "pending").lt("window_end", new Date().toISOString());

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const { data: tasks } = await supabase
      .from("rounding_tasks")
      .select("id,status,scheduled_at,window_end,completed_at,completed_by,room_id,rooms(room_number)")
      .gte("scheduled_at", todayStart.toISOString())
      .lte("scheduled_at", todayEnd.toISOString());

    const all = tasks ?? [];
    const completed = all.filter((t: any) => t.status === "completed");
    const overdue = all.filter((t: any) => t.status === "overdue");
    const pending = all.filter((t: any) => t.status === "pending");
    const late = completed.filter((t: any) => t.completed_at && t.completed_at > t.scheduled_at);
    const compliance = all.length ? Math.round((completed.length / all.length) * 100) : 0;

    const overdueRooms = overdue.map((t: any) => ({
      room_number: t.rooms?.room_number, scheduled_at: t.scheduled_at,
    })).slice(0, 50);

    // Per-employee
    const { data: byUser } = await supabase
      .from("rounding_tasks")
      .select("status,shift_assignment_id,shift_assignments!inner(user_id,profiles!inner(full_name,employee_id))")
      .gte("scheduled_at", todayStart.toISOString())
      .lte("scheduled_at", todayEnd.toISOString());

    const perEmp = new Map<string, { name: string; emp: string; total: number; completed: number; overdue: number }>();
    for (const t of (byUser ?? []) as any[]) {
      const uid = t.shift_assignments?.user_id;
      if (!uid) continue;
      const p = t.shift_assignments?.profiles;
      const key = uid;
      const cur = perEmp.get(key) ?? { name: p?.full_name ?? "Unknown", emp: p?.employee_id ?? "", total: 0, completed: 0, overdue: 0 };
      cur.total++;
      if (t.status === "completed") cur.completed++;
      if (t.status === "overdue") cur.overdue++;
      perEmp.set(key, cur);
    }

    return {
      totalDue: all.length,
      completed: completed.length,
      overdue: overdue.length,
      pending: pending.length,
      late: late.length,
      compliance,
      overdueRooms,
      perEmployee: Array.from(perEmp.values()),
    };
  });

// ---------- reports ----------
export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { start: string; end: string; user_id?: string; room_id?: string; status?: string }) =>
    z.object({
      start: z.string(),
      end: z.string(),
      user_id: z.string().uuid().optional(),
      room_id: z.string().uuid().optional(),
      status: z.enum(["pending", "completed", "overdue"]).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    let q = context.supabase
      .from("rounding_tasks")
      .select(`id,scheduled_at,window_end,completed_at,status,
               rooms(room_number,floors(name,units(name,facilities(name)))),
               shift_assignments!inner(user_id,shift_date,shifts(name),profiles!inner(full_name,employee_id))`)
      .gte("scheduled_at", data.start)
      .lte("scheduled_at", data.end)
      .order("scheduled_at");

    if (data.user_id) q = q.eq("shift_assignments.user_id", data.user_id);
    if (data.room_id) q = q.eq("room_id", data.room_id);
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r: any) => {
      const lateMs = r.completed_at ? Math.max(0, new Date(r.completed_at).getTime() - new Date(r.scheduled_at).getTime()) : 0;
      return {
        id: r.id,
        employee_name: r.shift_assignments?.profiles?.full_name ?? "",
        employee_id: r.shift_assignments?.profiles?.employee_id ?? "",
        room_number: r.rooms?.room_number ?? "",
        floor: r.rooms?.floors?.name ?? "",
        unit: r.rooms?.floors?.units?.name ?? "",
        facility: r.rooms?.floors?.units?.facilities?.name ?? "",
        shift: r.shift_assignments?.shifts?.name ?? "",
        scheduled_at: r.scheduled_at,
        completed_at: r.completed_at,
        status: r.status,
        late_minutes: r.completed_at ? Math.floor(lateMs / 60000) : null,
      };
    });
  });
