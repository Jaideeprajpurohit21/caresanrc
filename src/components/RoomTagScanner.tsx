import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { linkRoomNfcTag } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { startKeyboardWedge, startWebNfc, isWebNfcAvailable, type NfcSubscription } from "@/lib/nfc-reader-service";

type Props = {
  roomId: string;
  roomNumber: string;
  /** Called after the tag is stored for this room. */
  onLinked?: () => void;
  /** Shown as "Skip this room" when provided. */
  onSkip?: () => void;
  onClose?: () => void;
  /** e.g. "Room 3 of 10" */
  progressLabel?: string;
};

export function RoomTagScanner({ roomId, roomNumber, onLinked, onSkip, onClose, progressLabel }: Props) {
  const link = useServerFn(linkRoomNfcTag);
  const qc = useQueryClient();
  const [tagUid, setTagUid] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const webNfc = isWebNfcAvailable();

  const save = useMutation({
    mutationFn: (uid: string) => link({ data: { room_id: roomId, tag_uid: uid.trim() } }),
    onSuccess: (res: any) => {
      toast.success(res?.moved ? `Tag moved to Room ${roomNumber}` : `Tag linked to Room ${roomNumber}`);
      setTagUid("");
      qc.invalidateQueries({ queryKey: ["room-nfc-tags"] });
      onLinked?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not link that tag"),
  });

  // Reset when the wizard moves to another room.
  useEffect(() => {
    setTagUid("");
    inputRef.current?.focus();
  }, [roomId]);

  // Tag readers that "type" the serial, plus built-in NFC where the browser allows it.
  useEffect(() => {
    const subs: NfcSubscription[] = [];
    let cancelled = false;
    const handle = (uid: string) => {
      if (save.isPending) return;
      setTagUid(uid);
      save.mutate(uid);
    };
    subs.push(startKeyboardWedge({ onTag: handle }));
    if (webNfc) {
      startWebNfc({ onTag: handle, onError: (m) => toast.error(m) })
        .then((s) => {
          if (cancelled) s();
          else subs.push(s);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      subs.forEach((s) => s());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, webNfc]);

  function attemptSave() {
    const uid = tagUid.trim();
    if (save.isPending) return;
    if (uid.length < 2) {
      toast.error("Hold the tag against the reader, or type the serial number printed on it");
      inputRef.current?.focus();
      return;
    }
    save.mutate(uid);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Scan the NFC tag for Room {roomNumber}
          {progressLabel ? <span className="ml-2 text-xs font-normal text-muted-foreground">{progressLabel}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {webNfc
            ? "Hold the tag against the back of this phone — it links itself."
            : "Hold the tag against the connected reader, or type the serial number printed on the tag."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            ref={inputRef}
            className="flex-1 min-w-40"
            value={tagUid}
            onChange={(e) => setTagUid(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                attemptSave();
              }
            }}
            placeholder="Tag serial number"
            aria-label={`Tag serial number for room ${roomNumber}`}
          />
          <Button onClick={attemptSave} disabled={save.isPending}>
            {save.isPending ? "Linking…" : "Link tag"}
          </Button>
          {onSkip && (
            <Button variant="outline" onClick={onSkip} disabled={save.isPending}>
              Skip this room
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Done
            </Button>
          )}
        </div>
        {!webNfc && (
          <p className="text-xs text-muted-foreground">
            iPhone and iPad browsers can't read a tag from a web page, so use a connected reader or type the serial.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
