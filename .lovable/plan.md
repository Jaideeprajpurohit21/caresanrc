# POC Rounding Portal — Build Plan (v1 MVP)

A mobile-first React + Tailwind app on TanStack Start with Lovable Cloud (Supabase) for auth, database, and server logic. CNAs scan room QR codes during defined time windows; admins set everything up and review compliance.

## Scope for v1
- Admin: manage facilities/units/floors/rooms, generate & print QR codes, manage staff, configure shifts/frequency/grace, view dashboard, run & export reports (CSV + PDF).
- Staff: log in, see today's task list (Pending/Active/Completed/Overdue), open active task, scan room QR via device camera, get confirmation.
- Anti-cheating enforced server-side.
- No notifications in v1 (in-app overdue badges only).

## Roles & Auth
- Real email + password via Supabase Auth.
- **Admin invites only**: no public signup. One seeded admin email (you'll tell me which); admins create staff accounts (email + temp password) from the Staff page.
- `user_roles` table + `has_role()` security-definer function (admin / staff enum). Role checks via server functions, never client trust.
- Protected app lives under `_authenticated/`; `/auth` is the only public page.

## Data Model (Supabase)
- `profiles` (id → auth.users, full_name, employee_id, active)
- `user_roles` (user_id, role enum: admin|staff)
- `facilities` (id, name)
- `units` (id, facility_id, name)
- `floors` (id, unit_id, name)
- `rooms` (id, floor_id, room_number, qr_token uuid unique) — `qr_token` is the encrypted identifier embedded in the QR (random UUID, not the room number).
- `shifts` (id, facility_id, name, start_time, end_time, rounding_interval_minutes default 120, grace_minutes default 20)
- `shift_assignments` (id, shift_id, user_id, date) — who is on which shift on which day
- `rounding_tasks` (id, room_id, shift_assignment_id, scheduled_at, window_end, status: pending|completed|overdue, completed_at, completed_by, scan_log_id) — generated when a shift assignment is created, one row per (room × scheduled time).
- `scan_logs` (id, task_id, user_id, room_id, scanned_at, device_user_agent, result: success|wrong_room|too_early|expired|duplicate)

All tables: GRANT to authenticated + service_role, RLS on, policies scoped via `has_role()` and `auth.uid()`.

## QR Codes
- Each room gets a `qr_token` UUID at creation. QR encodes `rounding://room/<qr_token>` (token only — no room number, no facility info).
- Admin "Rooms" page: list rooms with a "Print QR sheet" action that renders a printable page of QR codes (one per room with the room number caption) using `qrcode` lib.

## Rounding Workflow & Anti-Cheating (server-enforced)
Single server function `scanRoomQr({ qr_token })` does all validation atomically:
1. Look up `room` by `qr_token`. If none → "Invalid QR code".
2. Find the caller's active `shift_assignment` for today.
3. Find the `rounding_task` for that room+assignment where `now BETWEEN scheduled_at AND window_end` AND `status = 'pending'`.
   - None & next task is in future → "Next round is not due yet" (log `too_early`).
   - Task exists but window already passed → mark task `overdue`, return "This task window has expired" (log `expired`).
   - Task already completed → "Already completed" (log `duplicate`).
4. On success: insert `scan_logs` row, update task `status='completed'`, `completed_at=now()`, `completed_by=user`, return confirmation payload (employee name, room, time, shift).

A scheduled task (cron via pg_cron or on-read sweep) marks any pending task whose `window_end < now()` as `overdue`. v1 will do this lazily on every dashboard/staff list query to avoid cron setup.

Tasks for a shift assignment are generated server-side at the moment the assignment is created (interval from shift start, capped at shift end).

## Staff UX (mobile-first, <10s flow)
- `/` after login → big list of cards: Active (green, tap to scan), Pending later (gray with time), Completed (check), Overdue (red).
- Tap Active → camera scanner (`@yudiel/react-qr-scanner` or `html5-qrcode`) full-screen → on detect, call `scanRoomQr` → success screen with checkmark + auto-return after 2s.
- Camera stream only; no image upload path.

## Admin UX
- `/admin` dashboard: today's totals (due, completed, missed, late), compliance %, live list of currently-overdue rooms, per-employee summary.
- `/admin/facilities` → facilities → units → floors → rooms (nested CRUD).
- `/admin/rooms` → list + bulk add ("Add rooms 101–120") + print QR sheet.
- `/admin/staff` → create staff (email, name, employee_id, temp password), deactivate, reset password (sends Supabase reset email).
- `/admin/shifts` → CRUD shifts, assign staff to shift for date range (auto-generates tasks).
- `/admin/reports` → filters (date range, employee, floor, unit, room, shift) → table + Export CSV / Export PDF (`jspdf` + `jspdf-autotable`).

## Routes
```
src/routes/
  __root.tsx
  index.tsx                      (redirect: admin→/admin, staff→/staff)
  auth.tsx                       (login only)
  _authenticated/route.tsx       (managed gate)
  _authenticated/staff.tsx       (CNA task list)
  _authenticated/scan.tsx        (camera scanner)
  _authenticated/admin.tsx       (dashboard)
  _authenticated/admin.facilities.tsx
  _authenticated/admin.rooms.tsx
  _authenticated/admin.rooms.print.tsx
  _authenticated/admin.staff.tsx
  _authenticated/admin.shifts.tsx
  _authenticated/admin.reports.tsx
```

## Server functions (in `src/lib/*.functions.ts`, all `requireSupabaseAuth`)
- `me()` — returns profile + role
- Facility/unit/floor/room CRUD (admin-only checked via `has_role`)
- `bulkAddRooms({ floor_id, start, end })`
- `createStaff`, `deactivateStaff`, `resetStaffPassword` (admin; loads `supabaseAdmin` inside handler)
- `createShift`, `assignShift` (generates rounding_tasks)
- `getMyTasksToday()`
- `scanRoomQr({ qr_token })` — the anti-cheat core
- `getDashboardStats()`, `getReport(filters)`

## Tech / Libraries to add
- `qrcode` (generate QR images)
- `@yudiel/react-qr-scanner` (camera scanning)
- `jspdf` + `jspdf-autotable` (PDF export)
- `papaparse` (CSV export)
- `zod` (input validation on every server fn)

## Out of scope for v1 (designed-for-later)
- Notifications (email/push/SMS), NFC, biometrics, EHR/nurse-call integration, multi-facility per user, offline mode. Schema leaves room (facility_id everywhere, scan_logs flexible result enum).

## Open items I'll need from you during build
- The seed admin email address (to put in the initial migration).
- Facility name and a starter set of rooms (or I'll seed a demo facility you can edit).

Approve this and I'll build it.