## 1. Fix silent scan failures

**Root cause (confirmed):** `src/routes/_authenticated.staff.tsx` — the scan mutation's `onError` only fires a toast and never sets `lastResult`, so when the RPC throws (network/server error) the user sees nothing where the result card should be. There's also no in-between loading state between `setScanning(false)` and the result rendering.

**Changes in `_authenticated.staff.tsx`:**
- In `onError`, set `lastResult` to a generic client-error result: `{ ok: false, code: 'client_error', title: "Something went wrong", message: "We couldn't reach the server. Check your connection and try again." }`.
- Render a "Checking…" spinner block when `mutate.isPending` (above the result card, below `scanning`).
- Keep camera-stops-on-decode behavior (already correct: `setScanning(false)` runs before mutate).

**`ScanResultCard`** already renders for both `ok: true` and `ok: false` — no change needed.

## 2. Clarify round-opening times

**2a. Schedule list (`_authenticated.admin.schedule.tsx`):** under each schedule row, compute and show the list of round-opening times client-side:
- Parse `shift_start_time` ("HH:MM:SS") and `frequency` (interval string like `"02:00:00"` or `"2 hours"` — use a small parser returning minutes).
- For `i = 1..rounds_per_shift`, compute `start + freq*i` minutes; format as `h:MM AM/PM` (wrap past 24h).
- Render `Rounds open at: 12:00 AM, 2:00 AM, …`.
- Change "Starts" label to "Shift starts (round 1 opens one frequency later)".

**2b. `submit_round_scan` migration:**
- Add `v_next_slot` tracking in the existing loop.
- Update `not_due` message to `'The next round for Room X opens at HH12:MI AM.'` and add `next_window_starts` field.
- Update `expired` message to append `' Next round opens at HH12:MI AM.'` and add `next_window_starts`.
- All other branches unchanged.
- Staff UI continues to render only `title`/`message` — `next_window_starts` is not surfaced (already true of `ScanResultCard`).

## 3. Admin dry-run diagnostic

**3a. Migration — add `p_dry_run boolean default false` to `submit_round_scan`:**
- Wrap `INSERT INTO scan_logs` with `IF NOT p_dry_run THEN ... END IF`.
- Add `'dry_run', p_dry_run` to every return jsonb (success + all rejection branches).
- Signature change is backward-compatible — existing one-arg calls keep working.

**3b. Server fn:** add `submitRoundScanDryRun` in `src/lib/api/rounding.functions.ts` — admin-only (`ensureAdmin`), takes `{ qr_token }`, calls RPC with `p_dry_run: true`.

**3c. New route `src/routes/_authenticated.admin.diagnostics.tsx`:**
- Room dropdown (from `listRooms`, display `Room {room_number}` / value `qr_token`).
- Big "Run test scan (no data changes)" button + prominent note: "This does not check anyone in and does not affect reports."
- Result panel shows: title, message, raw `code`, formatted `next_window_starts` (when present), and one-line explanation keyed by `code` per spec (off_shift / no_schedule / not_due / completed / already_done / expired).
- Add link from rooms page + AppShell admin nav.

## 4. QR download

**Per-room download** in `_authenticated.admin.rooms.tsx`:
- Add a "Download" button next to "Door label" per row.
- Render a hidden full-size canvas via `QRCode.toCanvas` (e.g., 512px) on click, then `canvas.toBlob` → trigger download as `room-{room_number}-qr.png`. Implement as a `downloadRoomQr(token, roomNumber)` helper.

**Bulk "Download all as ZIP":** add a top-bar button using `jszip` (already easy — small dep). For each room generate the PNG blob and add to zip, then save. Falls back gracefully if `jszip` import fails (skip bulk, keep per-room).

## Files

- edit `src/routes/_authenticated.staff.tsx` (error handling + loading state)
- edit `src/routes/_authenticated.admin.schedule.tsx` (round times list)
- edit `src/routes/_authenticated.admin.rooms.tsx` (download buttons)
- edit `src/lib/api/rounding.functions.ts` (admin dry-run server fn)
- edit `src/components/AppShell.tsx` (Diagnostics nav link)
- new `src/routes/_authenticated.admin.diagnostics.tsx`
- new migration: `submit_round_scan` v2 with `p_dry_run` + `next_window_starts`
- `bun add jszip` for bulk download

## Out of scope

Anti-cheat timing logic, staff success/rejection wording (other than the spec's `not_due`/`expired` time additions), PCC integration, scan_logs schema, all other routes.
