import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listFacilityTree, createFacility, createUnit, createFloor } from "@/lib/api/rounding.functions";
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
  const fn = useServerFn(listFacilityTree);
  const createFac = useServerFn(createFacility);
  const createU = useServerFn(createUnit);
  const createF = useServerFn(createFloor);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: ["facility-tree"], queryFn: () => fn({}) });

  const [newFac, setNewFac] = useState("");
  const addFac = useMutation({
    mutationFn: () => createFac({ data: { name: newFac } }),
    onSuccess: () => { setNewFac(""); toast.success("Facility added"); qc.invalidateQueries({ queryKey: ["facility-tree"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Facilities</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">New facility</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Facility name" value={newFac} onChange={(e) => setNewFac(e.target.value)} />
          <Button onClick={() => addFac.mutate()} disabled={!newFac || addFac.isPending}>Add</Button>
        </CardContent>
      </Card>

      {(data ?? []).map((f: any) => (
        <Card key={f.id}>
          <CardHeader><CardTitle className="text-base">{f.name}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <AddChild placeholder="New unit name" onAdd={async (name) => {
              await createU({ data: { facility_id: f.id, name } });
              qc.invalidateQueries({ queryKey: ["facility-tree"] });
            }} />
            {(f.units ?? []).map((u: any) => (
              <div key={u.id} className="rounded-md border p-3 space-y-2">
                <div className="font-medium">Unit · {u.name}</div>
                <AddChild placeholder="New floor name" onAdd={async (name) => {
                  await createF({ data: { unit_id: u.id, name } });
                  qc.invalidateQueries({ queryKey: ["facility-tree"] });
                }} />
                <ul className="text-sm text-muted-foreground space-y-1">
                  {(u.floors ?? []).map((fl: any) => (
                    <li key={fl.id}>Floor · {fl.name} ({(fl.rooms ?? []).length} rooms)</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AddChild({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<any> }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2">
      <Input placeholder={placeholder} value={val} onChange={(e) => setVal(e.target.value)} />
      <Button variant="secondary" disabled={!val || busy} onClick={async () => {
        setBusy(true);
        try { await onAdd(val); setVal(""); toast.success("Added"); }
        catch (e: any) { toast.error(e.message); }
        finally { setBusy(false); }
      }}>Add</Button>
    </div>
  );
}
