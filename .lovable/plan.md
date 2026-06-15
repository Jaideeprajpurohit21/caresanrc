## Goal

Adapt the existing app to the master prompt's anti-cheat model while keeping:
- TanStack `createServerFn` as the only client→server boundary (no direct `supabase.rpc` from the browser, no Edge Functions).
- `user_roles` table + `has_role()` for admin checks (NOT `role` on `profiles`).
- Existing `facilities` / `floors` / `rooms` / `profiles` / `scan_logs` tables, modified rather than dropped.

## Schema migration

### Drop / replace
- Drop `units` (the spec has facility → floors → rooms; no units).
- Drop `shifts`, `shift_assignments`, `rounding_tasks` (tasks are now computed, not stored).
- Drop existing `scan_logs` (column shape changes; current data is test data).

### Modify
- `facilities`: add `timezone text not null default 'America/Chicago'`.
- `floors`: drop `unit_id`, add `facility_id uuid not null references facilities`; keep `name`; add `unique (facility_id, name)`.
- `rooms`: ensure shape is `(id, floor_id, room_number, qr_token unique, active, created_at)`. Drop legacy cols.
- `profiles`: add `employee_id text unique`, `floor_id uuid references floors`, `active boolean default true`. Do NOT add a `role` column — roles stay in `user_roles`.

### Create
- `round_schedules` (per spec).
- New `scan_logs` per spec, with the `unique (room_id, schedule_id, scheduled_for)` constraint.
- All GRANTs + RLS per spec, BUT rewrite admin policies to use `public.has_role(auth.uid(),'admin')` instead of `(select role from profiles ...)`. Admin facility-scoping uses `(select facility_id from profiles where id = auth.uid())`.

### Functions
- `submit_round_scan(p_qr_token text) returns jsonb` — verbatim from spec.
- `get_floor_status(p_floor_id uuid)` — verbatim from spec.
- `get_round_report(p_floor_id, p_from, p_to)` — implement the real body (anchor + `generate_series` across the range + left join `scan_logs`), not the stub.
- All `security definer`, `grant execute ... to authenticated`, `revoke from public`.

## Server functions (TanStack)

Rewrite `src/lib/api/rounding.functions.ts` to expose the new model. All call the Postgres RPCs via the authenticated supabase client from `requireSupabaseAuth`:

- `submitRoundScan({ qr_token })` → `supabase.rpc('submit_round_scan', { p_qr_token })`. Returns the JSON verbatim.
- `getFloorStatus({ floor_id })` → `rpc('get_floor_status', ...)`.
- `getRoundReport({ floor_id, from, to })` → `rpc('get_round_report', ...)`.
- `getMe()` — keep, returns profile + `isAdmin` (from `has_role`) + assigned `floor_id`.
- Admin CRUD: `listFacilities/createFacility`, `listFloors/createFloor`, `listRooms/createRoom/regenerateRoomQr/setRoomActive`, `getSchedule/upsertSchedule`, `listStaff/createStaff/resetStaffPassword/setStaffActive`.
  - `createStaff` / `resetStaffPassword` / `setStaffActive` are privileged: `requireSupabaseAuth` + `has_role` admin check, then `await import('@/integrations/supabase/client.server')` for `supabaseAdmin`. They generate a temp password and return it once.

Delete obsolete server fns (units, shifts, shift_assignments, rounding_tasks generator, `getMyTasksToday`, `scanRoomQr` — replaced by `submitRoundScan`).

## Frontend

### Staff (`/staff`)
Rewrite `src/routes/_authenticated.staff.tsx` to be scan-only per Section 7:
- Header: caregiver name + shift name only.
- Status list from `get_floor_status`, mapped to "Pending" / "Done" / "Missed" — no times.
- One big "Scan QR code" button → opens `@yudiel/react-qr-scanner` full-screen.
- On decode → call `submitRoundScan`; render `data.title` / `data.message` based on `code`.
- Camera-denied fallback message (verbatim from spec); no alternative input.
- Poll `getFloorStatus` every 60s + on focus; if all rounds completed/overdue OR scan returns `off_shift` → `supabase.auth.signOut()` + redirect to `/auth` with the spec's message.
- Realtime: subscribe to `scan_logs` INSERT filtered by `floor_id`, refetch on event.

### Admin
- `/admin` (index): dashboard — stat cards from `get_round_report` for today + overdue rooms from `get_floor_status`. Replace current server-fn data source.
- `/admin/facilities`: keep, but remove the Units layer (Facility → Floors → Rooms only).
- `/admin/rooms` + `/admin/rooms/print`: keep, ensure QR token rendering still works against the new `rooms` shape.
- `/admin/shifts` → rename concept to **Schedule** (per floor); single form for `round_schedules`. Repurpose existing file.
- `/admin/staff`: CRUD using new server fns; show temp password modal on create/reset.
- `/admin/reports`: filters (floor, room, employee, status, date range) over `getRoundReport`; CSV (built-in), Excel (`xlsx`), PDF (`jspdf`) export. Install `xlsx` and `jspdf` if not present.
- Live Floor Status: new page `/admin/live` consuming `get_floor_status` with realtime + color-coded grid.

`AppShell` nav updated: Dashboard / Facilities / Rooms & QR / Schedule / Staff / Live / Reports.

## Acceptance tests (Section 11)

After implementation, run via SQL editor / direct RPC calls:
1–7: scan-engine behavior (unknown, completed, already_done, parallel rooms, not_due, expired, across-midnight). I'll run these via `psql` / `supabase--read_query`.
8: `get_floor_status` row shape.
9: RLS — confirm staff cannot select other users' scan_logs and direct INSERT denied; `submit_round_scan` still works (security definer).
10: visual check of staff UI.
11: auto sign-out at end of shift (manual via preview).
12: report exports (manual).

## Risks / known deviations

- The spec's RLS uses `(select role from profiles ...)`. I'm substituting `public.has_role(auth.uid(),'admin')` because that's the safer pattern already established. Functionally equivalent for admin gating.
- Dropping `units`, `shifts`, `shift_assignments`, `rounding_tasks` is irreversible. Existing test scan data lost.
- Auth signup must remain disabled; admins create staff via the privileged server fn.
- The current `_authenticated/route.tsx` gate stays; admin-only routes will additionally check `has_role` in their server fn (UI gates by `isAdmin` from `getMe`).

## Execution order

1. Migration (schema + RPCs + RLS + seed).
2. Rewrite `rounding.functions.ts`.
3. Rewrite Staff route.
4. Rewrite Admin routes + AppShell nav.
5. Run acceptance tests; fix issues.

Approve and I'll start with the migration.