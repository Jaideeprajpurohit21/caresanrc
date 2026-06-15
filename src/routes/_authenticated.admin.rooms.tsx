import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRooms, listFacilityTree, bulkAddRooms, deleteRoom } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/rooms")({
  head: () => ({ meta: [{ title: "Rooms & QR codes — Admin" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listRooms);
  const tree = useServerFn(listFacilityTree);
  const bulk = useServerFn(bulkAddRooms);
  const del = useServerFn(deleteRoom);
  const qc = useQueryClient();
  const { data: rooms } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => fn({}) });
  const { data: facilities } = useSuspenseQuery({ queryKey: ["facility-tree"], queryFn: () => tree({}) });

  const allFloors = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const f of facilities ?? []) for (const u of (f as any).units ?? []) for (const fl of u.floors ?? [])
      out.push({ id: fl.id, label: `${(f as any).name} · ${u.name} · ${fl.name}` });
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <h1 className="text-2xl font-bold">Rooms & QR codes</h1>
        <Link to="/admin/rooms/print"><Button variant="outline"><Printer className="h-4 w-4 mr-2" /> Print all QR codes</Button></Link>
      </div>

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
              <li key={r.id} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="min-w-0">
                  <div className="font-medium">Room {r.room_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.floors?.units?.facilities?.name} · {r.floors?.units?.name} · {r.floors?.name}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeRoom.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
