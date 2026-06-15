import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listFacilities, createFacility, createFloor } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/facilities")({
  head: () => ({ meta: [{ title: "Facilities — Admin" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listFacilities);
  const createFac = useServerFn(createFacility);
  const createF = useServerFn(createFloor);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: ["facilities"], queryFn: () => fn({}) });

  const [newFac, setNewFac] = useState("");
  const [tz, setTz] = useState("America/Chicago");
  const addFac = useMutation({
    mutationFn: () => createFac({ data: { name: newFac, timezone: tz } }),
    onSuccess: () => { setNewFac(""); toast.success("Facility added"); qc.invalidateQueries({ queryKey: ["facilities"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Facilities</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">New facility</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <Input placeholder="Facility name" value={newFac} onChange={(e) => setNewFac(e.target.value)} />
          <Input placeholder="Timezone (IANA, e.g. America/Chicago)" value={tz} onChange={(e) => setTz(e.target.value)} />
          <Button onClick={() => addFac.mutate()} disabled={!newFac || addFac.isPending}>Add</Button>
        </CardContent>
      </Card>

      {(data ?? []).map((f: any) => (
        <Card key={f.id}>
          <CardHeader>
            <CardTitle className="text-base">{f.name}</CardTitle>
            <div className="text-xs text-muted-foreground">{f.timezone}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <AddFloor onAdd={async (name) => {
              await createF({ data: { facility_id: f.id, name } });
              qc.invalidateQueries({ queryKey: ["facilities"] });
            }} />
            <ul className="text-sm text-muted-foreground space-y-1">
              {(f.floors ?? []).map((fl: any) => (
                <li key={fl.id}>Floor · {fl.name}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AddFloor({ onAdd }: { onAdd: (name: string) => Promise<any> }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2">
      <Input placeholder="New floor name" value={val} onChange={(e) => setVal(e.target.value)} />
      <Button variant="secondary" disabled={!val || busy} onClick={async () => {
        setBusy(true);
        try { await onAdd(val); setVal(""); toast.success("Added"); }
        catch (e: any) { toast.error(e.message); }
        finally { setBusy(false); }
      }}>Add floor</Button>
    </div>
  );
}
