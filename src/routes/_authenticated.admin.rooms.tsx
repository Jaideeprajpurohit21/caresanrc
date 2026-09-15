import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRooms, listFacilities, bulkAddRooms, deleteRoom } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer, Trash2, Tag, Download, Archive, Smartphone } from "lucide-react";
import { RoomQR } from "@/components/RoomQR";
import { NfcTagWriter } from "@/components/NfcTagWriter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import QRCode from "qrcode";
import { QR_ENABLED } from "@/lib/features";

async function makeQrPngBlob(token: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, String(token), { width: 512, margin: 2 });
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadRoomQr(token: string, roomNumber: string) {
  const blob = await makeQrPngBlob(token);
  downloadBlob(blob, `room-${roomNumber}-qr.png`);
}
async function downloadAllAsZip(rooms: any[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const r of rooms) {
    const blob = await makeQrPngBlob(r.qr_token);
    zip.file(`room-${r.room_number}-qr.png`, blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  downloadBlob(out, `room-qr-codes-${new Date().toISOString().slice(0, 10)}.zip`);
}


export const Route = createFileRoute("/_authenticated/admin/rooms")({
  head: () => ({
    meta: [
      { title: "Rooms — Admin" },
      { name: "description", content: "Add rooms and link each room's NFC tag for staff check-ins." },
    ],
  }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listRooms);
  const lFac = useServerFn(listFacilities);
  const bulk = useServerFn(bulkAddRooms);
  const del = useServerFn(deleteRoom);
  const lTags = useServerFn(listRoomNfcTags);
  const qc = useQueryClient();
  const { data: rooms } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => fn({}) });
  const { data: facilities } = useSuspenseQuery({ queryKey: ["facilities"], queryFn: () => lFac({}) });
  const { data: tags } = useSuspenseQuery({ queryKey: ["room-nfc-tags"], queryFn: () => lTags({}) });

  const tagsByRoom = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const t of (tags ?? []) as any[]) {
      const list = m.get(t.room_id) ?? [];
      list.push(t);
      m.set(t.room_id, list);
    }
    return m;
  }, [tags]);

  // Rooms queued for tag scanning (after adding, or a single room from the list).
  const [queue, setQueue] = useState<{ id: string; room_number: string }[]>([]);
  const current = queue[0];

  const allFloors = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const f of facilities ?? []) for (const fl of (f as any).floors ?? [])
      out.push({ id: fl.id, label: `${(f as any).name} · ${fl.name}` });
    return out;
  }, [facilities]);

  const [floorId, setFloorId] = useState("");
  const [start, setStart] = useState(101);
  const [end, setEnd] = useState(110);
  const [prefix, setPrefix] = useState("");
  const add = useMutation({
    mutationFn: () => bulk({ data: { floor_id: floorId, start, end, prefix } }),
    onSuccess: () => { toast.success("Rooms added"); qc.invalidateQueries({ queryKey: ["rooms"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeRoom = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["rooms"] }); },
  });

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <h1 className="text-2xl font-bold">{QR_ENABLED ? "Rooms & QR codes" : "Rooms"}</h1>
        <div className="flex gap-2 flex-wrap">
          {QR_ENABLED && (
            <>
              <Button
                variant="outline"
                disabled={!(rooms ?? []).length}
                onClick={() => downloadAllAsZip(rooms ?? []).catch((e) => toast.error(e?.message ?? "Download failed"))}
              >
                <Archive className="h-4 w-4 mr-2" /> Download all (ZIP)
              </Button>
              <Link to="/admin/rooms/labels"><Button variant="outline"><Tag className="h-4 w-4 mr-2" /> Print door labels</Button></Link>
              <Link to="/admin/rooms/print"><Button variant="outline"><Printer className="h-4 w-4 mr-2" /> Print QR sheet</Button></Link>
            </>
          )}
          <Link to="/admin/rooms/nfc"><Button variant="outline"><Smartphone className="h-4 w-4 mr-2" /> Link NFC tags</Button></Link>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Two ways to use NFC.</strong> Android phones running Chrome, Edge, or Samsung Internet read tags
          directly. iPads and iPhones need an NFC reader connected to them — those readers send the tag's serial
          number into the check-in screen. Link each tag's serial number to its room first under{" "}
          <strong>Link NFC tags</strong>.{QR_ENABLED ? " QR scanning stays available on every device." : ""}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle className="text-base">Bulk add rooms</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={floorId} onValueChange={setFloorId}>
            <SelectTrigger className="col-span-2"><SelectValue placeholder="Choose floor" /></SelectTrigger>
            <SelectContent>{allFloors.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <Input type="number" value={start} onChange={(e) => setStart(+e.target.value)} placeholder="Start" />
          <Input type="number" value={end} onChange={(e) => setEnd(+e.target.value)} placeholder="End" />
          <Button className="col-span-2 md:col-span-5" disabled={!floorId || add.isPending} onClick={() => add.mutate()}>Add rooms</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{(rooms ?? []).length} rooms</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(rooms ?? []).map((r: any) => (
              <li key={r.id} className="py-3 space-y-3">
                <div className={`grid items-center gap-3 ${QR_ENABLED ? "grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
                  {QR_ENABLED && <RoomQR token={r.qr_token} size={72} />}
                  <div className="min-w-0">
                    <div className="font-medium">Room {r.room_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.floors?.facilities?.name} · {r.floors?.name}</div>
                  </div>
                  {QR_ENABLED && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadRoomQr(r.qr_token, r.room_number).catch((e) => toast.error(e?.message ?? "Download failed"))}
                      >
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                      <Link to="/admin/rooms/$roomId/label" params={{ roomId: r.id }}>
                        <Button variant="outline" size="sm"><Tag className="h-4 w-4 mr-1" /> Door label</Button>
                      </Link>
                    </>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removeRoom.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <NfcTagWriter token={String(r.qr_token)} roomNumber={r.room_number} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
