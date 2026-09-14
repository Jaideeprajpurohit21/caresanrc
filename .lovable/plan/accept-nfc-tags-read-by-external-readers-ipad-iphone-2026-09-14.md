# Accept NFC tags read by external readers (iPad / iPhone)

Today only Android phones can read tags directly in the browser. This adds a second way in: a plug-in or Bluetooth NFC reader attached to an iPad or iPhone. Those readers "type" the tag's serial number into whatever screen is open, so the check-in screen will listen for that and treat it exactly like a tap.

Because the door tags are factory tags that only report their built-in serial number, each tag has to be linked to a room once.

## What gets added

**1. Linking tags to rooms (admin)**
- New page: Rooms > "Link NFC tags".
- Pick a room, then tap the tag on the reader (or type/paste the serial). The serial is saved against that room.
- A list shows every linked tag with its room, and lets you unlink or move a tag to another room.
- Same serial cannot be linked to two rooms; a room can have more than one tag (e.g. 101A / 101B doors).

**2. Check-in accepts reader input (staff)**
- The "Scan NFC tag" screen works on every device now:
  - Android phone with NFC: unchanged, tap directly.
  - iPad / iPhone / desktop with a reader attached: the screen waits for the reader and reacts as soon as the tag is read — no button press needed.
  - A "Enter code by hand" box as a last-resort backup.
- The screen tells the staff member which mode it is in ("Waiting for the reader — hold the tag against it").
- Result message stays the same: "Scan completed" plus the next scheduled scan time.

**3. Matching logic**
- A check-in now accepts either the room's own code (tags written by this app, QR codes) or a linked tag serial. Serials are matched case-insensitively and ignore separators like `:` or `-`.
- If a tag is not linked yet, the message is clear: "This tag isn't linked to a room yet — ask an administrator to link it."

**4. Reports**
- Check-ins made through a reader are recorded as NFC, so existing reports and the check-in count are unaffected.

## Technical notes

- New table `room_nfc_tags` (`room_id`, `tag_uid`, `tag_uid_normalized` unique, `label`, timestamps). Grants for `authenticated` + `service_role`; RLS: admins of the room's facility manage rows, staff of the facility may read.
- `submit_round_scan(p_qr_token, p_dry_run, p_input_method)` gains resolution by normalized tag serial when the value is not a valid room token, plus a new `unlinked_tag` result code (logged to `scan_error_logs` like other failures).
- `NfcCheckIn` component: keeps Web NFC path; adds a keyboard-wedge capture (focused hidden input, submits on Enter or short idle timeout, ignores stray keys) and a manual-entry field. Capability text driven off `isNfcSupported()` rather than hiding the screen.
- `/scan` deep link additionally accepts `?code=` so a reader/Shortcut that opens a URL also works.
- New server functions: `listRoomNfcTags`, `linkRoomNfcTag`, `unlinkRoomNfcTag` in `rounding.functions.ts`, admin-guarded.
- New route `_authenticated.admin.rooms.nfc.tsx` with a link from the Rooms page; the existing Android-only notice is reworded to mention reader support.
