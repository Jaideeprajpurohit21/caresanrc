import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRooms, listPccLinks, upsertPccLink, getPccIntegrationStatus } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Admin" }] }),
  component: Page,
});

function Page() {
  const lRooms = useServerFn(listRooms);
  const lLinks = useServerFn(listPccLinks);
  const lStatus = useServerFn(getPccIntegrationStatus);
  const save = useServerFn(upsertPccLink);
  const qc = useQueryClient();

  const { data: rooms } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => lRooms({}) });
  const { data: links } = useSuspenseQuery({ queryKey: ["pcc-links"], queryFn: () => lLinks({}) });
  const { data: status } = useSuspenseQuery({ queryKey: ["pcc-status"], queryFn: () => lStatus({}) });

  const linkByRoom = useMemo(() => {
    const m = new Map<string, { pcc_patient_id?: string | null; pcc_task_id?: string | null }>();
    for (const l of (links ?? []) as any[]) m.set(l.room_id, l);
    return m;
  }, [links]);

  const configured = status?.api_base_set && status?.client_id_set && status?.client_secret_set;

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">PointClickCare Integration</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Connection</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {configured
              ? <><CheckCircle2 className="h-4 w-4 text-green-600" /><span>Credentials configured.</span></>
              : <><AlertCircle className="h-4 w-4 text-amber-600" /><span>Not configured — completion sync is a no-op.</span></>}
          </div>
          <ul className="text-sm grid sm:grid-cols-3 gap-2">
            <li><Badge variant={status?.api_base_set ? "default" : "secondary"}>PCC_API_BASE {status?.api_base_set ? "✓" : "—"}</Badge></li>
            <li><Badge variant={status?.client_id_set ? "default" : "secondary"}>PCC_CLIENT_ID {status?.client_id_set ? "✓" : "—"}</Badge></li>
            <li><Badge variant={status?.client_secret_set ? "default" : "secondary"}>PCC_CLIENT_SECRET {status?.client_secret_set ? "✓" : "—"}</Badge></li>
          </ul>
          <p className="text-xs text-muted-foreground">
            These are stored as backend secrets — never on this page or in the browser. Ask a developer
            to set <code>PCC_API_BASE</code>, <code>PCC_CLIENT_ID</code>, and <code>PCC_CLIENT_SECRET</code> once
            PointClickCare Developer API access is granted. Until all three are set, the after-scan webhook
            logs and exits without contacting PCC.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room ↔ PCC task mapping</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Enter the PointClickCare resident ID and care-plan task ID for each room. Leave both blank to
            remove the mapping. Sync runs only for rooms with a complete mapping.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(rooms ?? []).map((r: any) => (
              <RoomRow
                key={r.id}
                room={r}
                existing={linkByRoom.get(r.id)}
                onSave={async (patientId, taskId) => {
                  try {
                    await save({ data: { room_id: r.id, pcc_patient_id: patientId, pcc_task_id: taskId } });
                    qc.invalidateQueries({ queryKey: ["pcc-links"] });
                    toast.success("Mapping saved");
                  } catch (e: any) { toast.error(e.message); }
                }}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function RoomRow({ room, existing, onSave }: {
  room: any;
  existing?: { pcc_patient_id?: string | null; pcc_task_id?: string | null };
  onSave: (patientId: string, taskId: string) => Promise<void>;
}) {
  const [patientId, setPatientId] = useState(existing?.pcc_patient_id ?? "");
  const [taskId, setTaskId] = useState(existing?.pcc_task_id ?? "");
  const dirty = patientId !== (existing?.pcc_patient_id ?? "") || taskId !== (existing?.pcc_task_id ?? "");
  const save = useMutation({ mutationFn: () => onSave(patientId, taskId) });

  return (
    <li className="py-3 grid grid-cols-1 md:grid-cols-[180px_1fr_1fr_auto] gap-2 items-center">
      <div className="min-w-0">
        <div className="font-medium">Room {room.room_number}</div>
        <div className="text-xs text-muted-foreground truncate">
          {room.floors?.facilities?.name} · {room.floors?.name}
        </div>
      </div>
      <Input placeholder="PCC patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
      <Input placeholder="PCC task ID" value={taskId} onChange={(e) => setTaskId(e.target.value)} />
      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
    </li>
  );
}
