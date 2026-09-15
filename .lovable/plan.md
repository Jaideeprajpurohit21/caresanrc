# Rooms page cleanup + link a tag while adding rooms

## What changes on the Rooms page

1. **Naming**
   - Page title becomes **Rooms** (no mention of QR).
   - The section "Bulk add rooms" becomes **Add Rooms** — it still adds a whole range at once, just without the word "bulk".

2. **Suffix instead of prefix**
   - The "Prefix" box becomes **Suffix**, added after the number: number 200 with suffix `A` creates room `200A`. Leave it empty for plain numbers.

3. **Tag linking built into adding rooms**
   - After you press **Add Rooms**, a panel appears listing every room just created, one at a time:
     "Scan the NFC tag for Room 200" with the serial box focused.
   - Hold the tag against a connected reader (or tap it on an Android phone with Chrome), and the serial fills in and saves against that room automatically; then it moves to the next room.
   - Buttons: **Skip this room** and **Done** so you can stop partway. Skipped rooms can still be linked later on the existing Link NFC tags page.
   - On the room list, each room shows whether a tag is linked, with a **Scan tag** button to link or replace it in place — so tags no longer have to be added on a separate page.

## Honest note about iPhone and iPad

Apple does not let any browser read an NFC tag from a web page. On iPhone/iPad the serial has to come from a connected reader or be typed/pasted. Tapping a tag directly works on an Android phone in Chrome. The panel says this in one short line rather than blocking you.

## Technical notes

- `src/routes/_authenticated.admin.rooms.tsx`: rename headings/labels, rename the prefix field to suffix, add a post-add "link tags" wizard using the existing `linkRoomNfcTag` server function plus `startWebNfc` / `startKeyboardWedge` from `src/lib/nfc-reader-service.ts`, and show linked-tag state per room from `listRoomNfcTags`.
- `bulkAddRooms` in `src/lib/api/rounding.functions.ts`: accept `suffix` (keeping `prefix` optional for compatibility) and build `${n}${suffix}`; return the created rooms (id + room_number) so the wizard can walk them.
- No database changes: `room_nfc_tags` and its policies already support this.
- `/admin/rooms/nfc` stays as-is for bulk review, unlinking and moving tags.
