
## Scope

Three refinements to the existing rooms/scan flow. No schema changes — `rooms.qr_token` default already exists, and the success message change is a one-line edit inside `submit_round_scan`.

## 1. Inline QR on the Rooms list (`src/routes/_authenticated.admin.rooms.tsx`)

Currently each room row shows only its number + facility/floor + delete button. After bulk-add, the admin has to navigate to `/admin/rooms/print` to see codes.

- Render a small QR thumbnail (≈80px) inside each row, using `qrcode` (already installed, used by the print page) drawn into a canvas via `useEffect`.
- Extract the existing `QRCard`-style canvas drawing into a reusable `<RoomQR token size />` component in `src/components/RoomQR.tsx` so both the list row and the print pages share it.
- Add a per-row "Print door label" link → `/admin/rooms/$roomId/label`.

Result: creating a room (single or bulk) immediately shows its QR in the list — no extra step.

## 2. Door-label print layouts

Two new routes, both using the same `<DoorLabel room />` component:

- `src/routes/_authenticated.admin.rooms.$roomId.label.tsx` — single room, one label per page.
- `src/routes/_authenticated.admin.rooms.labels.tsx` — bulk, one label per page for every room (optional `?floor_id=` filter via search param if easy; otherwise all rooms).

Add a "Print door labels" button to the rooms page header, next to the existing "Print all QR codes".

### Label layout (`src/components/DoorLabel.tsx`)

- CSS `@page { size: 4in 6in; margin: 0.25in }` scoped via a print stylesheet block on the label page only (so it doesn't affect the QR-sheet page).
- `break-after: page` between labels for the bulk version.
- Content, centered:
  - "Room {room_number}" — large bold (≈48pt).
  - QR canvas at ≈2in square (width ~190px at 96dpi, rendered with `QRCode.toCanvas({ width: 384 })` for crisp scaling).
  - Small caption: "Scan to check in".
- No facility name, no branding, no employee/scheduling info.
- Screen preview mirrors the print layout inside a bordered card so admins see what will print; a "Print" button calls `window.print()`.

The existing `/admin/rooms/print` grid stays as-is (it's the bulk "QR sheet" admin reference, not door labels).

## 3. Success message wording

Migration updating only the success branch of `public.submit_round_scan` (everything else byte-identical to the current function):

- `title` → `"You're checked in!"`
- `message` → `'You checked in to Room '||v_room.room_number||'. Thank you for checking in.'`

All other branches (`already_done`, `not_due`, `expired`, `unknown_qr`, `off_shift`, `no_schedule`, `not_authenticated`) untouched.

### Staff UI (`src/components/RoomScanner.tsx` → `ScanResultCard`)

Already renders only `title` + `message` (no timestamp / late-minutes / next-round) — the SQL change alone delivers the spec. The check icon is already shown for `ok` results. No component changes needed, but I'll verify by reading the rendered output once built.

## Files

- new: `src/components/RoomQR.tsx`
- new: `src/components/DoorLabel.tsx`
- new: `src/routes/_authenticated.admin.rooms.$roomId.label.tsx`
- new: `src/routes/_authenticated.admin.rooms.labels.tsx`
- new: migration `update_submit_round_scan_success_message.sql`
- edit: `src/routes/_authenticated.admin.rooms.tsx` (inline QR, per-row label link, header button)

## Out of scope (unchanged)

- `rooms.qr_token` schema/default — already correct.
- Existing `/admin/rooms/print` bulk QR sheet — kept as-is.
- All other scan-result branches and the anti-cheat logic.
- PCC sync, deep-link `/scan` flow, session expiry.
