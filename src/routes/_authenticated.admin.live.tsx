import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { listFacilities, getFloorStatus } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/live")({
  head: () => ({ meta: [{ title: "Live Floor Status — Admin" }] }),
  component: Page,
});

function Page() {
  const lFac = useServerFn(listFacilities);
  const getStatus = useServerFn(getFloorStatus);
  const qc = useQueryClient();
  const { data: facilities } = useSuspenseQuery({ queryKey: ["facilities"], queryFn: () => lFac({}) });

  const allFloors = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const f of facilities ?? []) for (const fl of (f as any).floors ?? [])
      out.push({ id: fl.id, label: `${(f as any).name} · ${fl.name}` });
    return out;
  }, [facilities]);

  const [floorId, setFloorId] = useState(allFloors[0]?.id ?? "");
  useEffect(() => { if (!floorId && allFloors[0]) setFloorId(allFloors[0].id); }, [allFloors, floorId]);

  const { data: rows } = useSuspenseQuery({
    queryKey: ["floor-status", floorId],
    queryFn: () => floorId ? getStatus({ data: { floor_id: floorId } }) : Promise.resolve([]),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!floorId) return;
    const ch = supabase.channel(`live:${floorId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_logs", filter: `floor_id=eq.${floorId}` },
        () => qc.invalidateQueries({ queryKey: ["floor-status", floorId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [floorId, qc]);

  const toneFor = (s: string) =>
    s === "completed" ? "bg-green-500/10 border-green-500/40 text-green-700"
    : s === "active" ? "bg-primary/10 border-primary/40 text-primary"
    : s === "overdue" ? "bg-destructive/10 border-destructive/40 text-destructive"
    : "bg-muted border-border";

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,320px)] gap-3 items-end">
        <h1 className="text-2xl font-bold">Live Floor Status</h1>
        <Select value={floorId} onValueChange={setFloorId}>
          <SelectTrigger><SelectValue placeholder="Floor" /></SelectTrigger>
          <SelectContent>{allFloors.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {(rows ?? []).map((r: any) => (
          <Card key={r.room_id} className={`border ${toneFor(r.status)}`}>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Room {r.room_number}</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              <div className="capitalize font-medium">{r.status}</div>
              <div className="tabular-nums">{fmtTime(r.scheduled_for)}</div>
              {r.completed_by && <div className="truncate">by {r.completed_by}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
