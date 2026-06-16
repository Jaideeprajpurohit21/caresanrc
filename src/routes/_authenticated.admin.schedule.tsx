import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSchedules, listFacilities, upsertSchedule } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// Parse a PG interval string ("02:00:00", "2 hours", "00:20:00") to minutes.
function intervalToMinutes(iv: string): number {
  if (!iv) return 0;
  const hms = /^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(iv);
  if (hms) return +hms[1] * 60 + +hms[2] + +hms[3] / 60;
  let mins = 0;
  for (const m of iv.matchAll(/(\d+(?:\.\d+)?)\s*(hour|hours|hr|h|minute|minutes|min|m|second|seconds|sec|s)/gi)) {
    const v = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith("h")) mins += v * 60;
    else if (u.startsWith("m") && u !== "s") mins += v;
    else if (u.startsWith("s")) mins += v / 60;
  }
  return mins;
}
function formatTimeOfDay(totalMin: number): string {
  const m = ((Math.round(totalMin) % (24 * 60)) + 24 * 60) % (24 * 60);
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ampm}`;
}
function computeRoundTimes(startHHMM: string, freqInterval: string, count: number): string[] {
  const [hh, mm] = startHHMM.split(":").map(Number);
  const startMin = (hh || 0) * 60 + (mm || 0);
  const freq = intervalToMinutes(freqInterval);
  const out: string[] = [];
  for (let i = 1; i <= count; i++) out.push(formatTimeOfDay(startMin + freq * i));
  return out;
}

export const Route = createFileRoute("/_authenticated/admin/schedule")({
  head: () => ({ meta: [{ title: "Schedule — Admin" }] }),
  component: Page,
});

function Page() {
  const lSched = useServerFn(listSchedules);
  const lFac = useServerFn(listFacilities);
  const upsert = useServerFn(upsertSchedule);
  const qc = useQueryClient();
  const { data: schedules } = useSuspenseQuery({ queryKey: ["schedules"], queryFn: () => lSched({}) });
  const { data: facilities } = useSuspenseQuery({ queryKey: ["facilities"], queryFn: () => lFac({}) });

  const allFloors = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const f of facilities ?? []) for (const fl of (f as any).floors ?? [])
      out.push({ id: fl.id, label: `${(f as any).name} · ${fl.name}` });
    return out;
  }, [facilities]);

  const [form, setForm] = useState({
    floor_id: "", shift_name: "Night", shift_start_time: "22:00",
    frequency_hours: 2, grace_minutes: 20, rounds_per_shift: 5,
  });
  const save = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => { toast.success("Schedule saved"); qc.invalidateQueries({ queryKey: ["schedules"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Rounding Schedule</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">New / replace schedule for a floor</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <Label>Floor</Label>
            <Select value={form.floor_id} onValueChange={(v) => setForm({ ...form, floor_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick floor" /></SelectTrigger>
              <SelectContent>{allFloors.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Shift name</Label><Input value={form.shift_name} onChange={(e) => setForm({ ...form, shift_name: e.target.value })} /></div>
          <div><Label>Start time</Label><Input type="time" value={form.shift_start_time} onChange={(e) => setForm({ ...form, shift_start_time: e.target.value })} /></div>
          <div><Label>Rounds per shift</Label><Input type="number" min={1} max={12} value={form.rounds_per_shift} onChange={(e) => setForm({ ...form, rounds_per_shift: +e.target.value })} /></div>
          <div><Label>Frequency (hours)</Label><Input type="number" step="0.5" value={form.frequency_hours} onChange={(e) => setForm({ ...form, frequency_hours: +e.target.value })} /></div>
          <div><Label>Grace (minutes)</Label><Input type="number" min={1} max={120} value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: +e.target.value })} /></div>
          <div className="sm:col-span-3"><Button disabled={!form.floor_id || save.isPending} onClick={() => save.mutate()}>Save schedule</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">All schedules</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(schedules ?? []).map((s: any) => {
              const times = computeRoundTimes(
                String(s.shift_start_time).slice(0, 5),
                String(s.frequency ?? ""),
                Number(s.rounds_per_shift) || 0,
              );
              return (
                <li key={s.id} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {s.shift_name} · {s.floors?.facilities?.name} · {s.floors?.name}
                      {s.active && <Badge variant="secondary">active</Badge>}
                    </div>
                    <div
                      className="text-xs text-muted-foreground"
                      title="Shift starts is when the shift begins; round 1 opens one full frequency interval later."
                    >
                      Shift starts {String(s.shift_start_time).slice(0, 5)} (round 1 opens one frequency later) · {s.rounds_per_shift} rounds · every {s.frequency} · grace {s.grace}
                    </div>
                    {times.length > 0 && (
                      <div className="text-xs mt-1">
                        <span className="font-medium">Rounds open at:</span> {times.join(", ")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
