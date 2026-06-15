import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listShifts, createShift, assignShift, listStaff, listFacilityTree } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/shifts")({
  head: () => ({ meta: [{ title: "Shifts — Admin" }] }),
  component: Page,
});

function Page() {
  const lShifts = useServerFn(listShifts);
  const lStaff = useServerFn(listStaff);
  const lTree = useServerFn(listFacilityTree);
  const create = useServerFn(createShift);
  const assign = useServerFn(assignShift);
  const qc = useQueryClient();
  const { data: shifts } = useSuspenseQuery({ queryKey: ["shifts"], queryFn: () => lShifts({}) });
  const { data: staff } = useSuspenseQuery({ queryKey: ["staff"], queryFn: () => lStaff({}) });
  const { data: tree } = useSuspenseQuery({ queryKey: ["facility-tree"], queryFn: () => lTree({}) });

  const [form, setForm] = useState({ facility_id: "", name: "Night", start_time: "22:00", end_time: "06:00", rounding_interval_minutes: 120, grace_minutes: 20 });
  const addShift = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => { toast.success("Shift created"); qc.invalidateQueries({ queryKey: ["shifts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const [assignForm, setAssignForm] = useState({ shift_id: "", user_id: "", shift_date: new Date().toISOString().slice(0, 10) });
  const doAssign = useMutation({
    mutationFn: () => assign({ data: assignForm }),
    onSuccess: (r: any) => toast.success(`Assigned · ${r.tasks_created} rounding tasks created`),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Shifts</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">New shift</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <Label>Facility</Label>
            <Select value={form.facility_id} onValueChange={(v) => setForm({ ...form, facility_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
              <SelectContent>{(tree ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Interval (min)</Label><Input type="number" value={form.rounding_interval_minutes} onChange={(e) => setForm({ ...form, rounding_interval_minutes: +e.target.value })} /></div>
          <div><Label>Start time</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
          <div><Label>End time</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
          <div><Label>Grace (min)</Label><Input type="number" value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: +e.target.value })} /></div>
          <div className="sm:col-span-3"><Button disabled={!form.facility_id || addShift.isPending} onClick={() => addShift.mutate()}>Create shift</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">All shifts</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(shifts ?? []).map((s: any) => (
              <li key={s.id} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name} · {s.facilities?.name}</div>
                  <div className="text-xs text-muted-foreground">{s.start_time}–{s.end_time} · every {s.rounding_interval_minutes}m · grace {s.grace_minutes}m</div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Assign shift to staff</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-4 gap-3">
          <Select value={assignForm.shift_id} onValueChange={(v) => setAssignForm({ ...assignForm, shift_id: v })}>
            <SelectTrigger><SelectValue placeholder="Shift" /></SelectTrigger>
            <SelectContent>{(shifts ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.facilities?.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={assignForm.user_id} onValueChange={(v) => setAssignForm({ ...assignForm, user_id: v })}>
            <SelectTrigger><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>{(staff ?? []).filter((s: any) => s.active).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={assignForm.shift_date} onChange={(e) => setAssignForm({ ...assignForm, shift_date: e.target.value })} />
          <Button disabled={!assignForm.shift_id || !assignForm.user_id || doAssign.isPending} onClick={() => doAssign.mutate()}>Assign & generate tasks</Button>
        </CardContent>
      </Card>
    </div>
  );
}
