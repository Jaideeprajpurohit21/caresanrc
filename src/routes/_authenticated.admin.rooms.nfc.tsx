import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { listRooms, listRoomNfcTags, linkRoomNfcTag, unlinkRoomNfcTag } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Info, Trash2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/rooms/nfc")({
  head: () => ({
    meta: [
      { title: "Link NFC tags to rooms — Admin" },
      { name: "description", content: "Link each physical NFC tag's serial number to a room so tag readers can check staff in." },
    ],
  }),
  component: Page,
});

function Page() {
  const lRooms = useServerFn(listRooms);
  const lTags = useServerFn(listRoomNfcTags);
  const link = useServerFn(linkRoomNfcTag);
  const unlink = useServerFn(unlinkRoomNfcTag);
  const qc = useQueryClient();

  const { data: rooms } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => lRooms({}) });
  const { data: tags } = useSuspenseQuery({ queryKey: ["room-nfc-tags"], queryFn: () => lTags({}) });

  const [roomId, setRoomId] = useState("");
  const [tagUid, setTagUid] = useState("");
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [roomId]);

  const save = useMutation({
    mutationFn: () => link({ data: { room_id: roomId, tag_uid: tagUid.trim(), label: label.trim() || undefined } }),
    onSuccess: (res: any) => {
      toast.success(res?.moved ? "Tag moved to this room" : "Tag linked");
      setTagUid("");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["room-nfc-tags"] });
      inputRef.current?.focus();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not link that tag"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => unlink({ data: { id } }),
    onSuccess: () => {
      toast.success("Tag unlinked");
      qc.invalidateQueries({ queryKey: ["room-nfc-tags"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not unlink that tag"),
  });

  const canSave = !!roomId && tagUid.trim().length >= 2 && !save.isPending;

  function attemptSave() {
    if (save.isPending) return;
    if (!roomId) {
      toast.error("Choose a room first");
      return;
    }
    if (tagUid.trim().length < 2) {
      toast.error("Enter the tag's serial number, or hold the tag against a connected reader");
      inputRef.current?.focus();
      return;
    }
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Link NFC tags</h1>
        <Link to="/admin/rooms">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to rooms
          </Button>
        </Link>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Choose a room, then hold the tag against the connected reader — the serial number appears in the box
          below and saves when you press <strong>Link tag</strong>. You can also type or paste a serial number.
          Once linked, any device with a reader (including iPads and iPhones) can check in with that tag.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle className="text-base">Link a tag to a room</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Choose room" /></SelectTrigger>
            <SelectContent>
              {(rooms ?? []).map((r: any) => (
                <SelectItem key={r.id} value={r.id}>
                  Room {r.room_number} · {r.floors?.facilities?.name} · {r.floors?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            ref={inputRef}
            value={tagUid}
            onChange={(e) => setTagUid(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                save.mutate();
              }
            }}
            placeholder="Tag serial number"
            aria-label="Tag serial number"
          />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" />
          <Button className="md:col-span-4" onClick={attemptSave}>
            {save.isPending ? "Linking…" : "Link tag"}
          </Button>
          <p className="md:col-span-4 text-xs text-muted-foreground">
            On an iPhone or iPad the serial number can't be read by the browser: type or paste it from the tag,
            or hold the tag against a connected reader.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{(tags ?? []).length} linked tags</CardTitle></CardHeader>
        <CardContent>
          {!(tags ?? []).length && (
            <p className="text-sm text-muted-foreground">No tags linked yet.</p>
          )}
          <ul className="divide-y">
            {(tags ?? []).map((t: any) => (
              <li key={t.id} className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Room {t.rooms?.room_number ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.tag_uid}{t.label ? ` · ${t.label}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(t.id)} aria-label="Unlink tag">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
