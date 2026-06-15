import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { getRoundReport, listFacilities, listStaff } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — Admin" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getRoundReport);
  const lFac = useServerFn(listFacilities);
  const lStaff = useServerFn(listStaff);
  const { data: facilities } = useSuspenseQuery({ queryKey: ["facilities"], queryFn: () => lFac({}) });
  const { data: staff } = useSuspenseQuery({ queryKey: ["staff"], queryFn: () => lStaff({}) });

  const allFloors = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const f of facilities ?? []) for (const fl of (f as any).floors ?? [])
      out.push({ id: fl.id, label: `${(f as any).name} · ${fl.name}` });
    return out;
  }, [facilities]);

  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ floor_id: "", start: today, end: today, user_id: "all", status: "all" });

  const run = useMutation({
    mutationFn: () => fn({
      data: {
        floor_id: filters.floor_id,
        from: new Date(filters.start + "T00:00:00").toISOString(),
        to: new Date(filters.end + "T23:59:59").toISOString(),
        user_id: filters.user_id !== "all" ? filters.user_id : undefined,
        status: filters.status as any,
      },
    }),
    onError: (e: any) => toast.error(e.message),
  });

  const rows: any[] = run.data ?? [];

  const exportCsv = () => {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rounding-${filters.start}-${filters.end}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text(`Rounding report ${filters.start} – ${filters.end}`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Employee", "Emp ID", "Room", "Round", "Shift", "Scheduled", "Completed", "Status", "Late (min)"]],
      body: rows.map((r: any) => [r.employee_name ?? "—", r.employee_id ?? "", r.room_number, r.round_index, r.shift_label, fmtDateTime(r.scheduled_for), fmtDateTime(r.completed_at), r.status, r.late_minutes ?? ""]),
      styles: { fontSize: 8 },
    });
    doc.save(`rounding-${filters.start}-${filters.end}.pdf`);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-6 gap-3 items-end">
          <div className="sm:col-span-2">
            <Label>Floor</Label>
            <Select value={filters.floor_id} onValueChange={(v) => setFilters({ ...filters, floor_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick floor" /></SelectTrigger>
              <SelectContent>{allFloors.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Start date</Label><Input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} /></div>
          <div><Label>End date</Label><Input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} /></div>
          <div>
            <Label>Employee</Label>
            <Select value={filters.user_id} onValueChange={(v) => setFilters({ ...filters, user_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(staff ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="sm:col-span-6" disabled={!filters.floor_id || run.isPending} onClick={() => run.mutate()}>{run.isPending ? "Running…" : "Run report"}</Button>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
            <CardTitle className="text-base">{rows.length} rows</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
              <Button variant="outline" size="sm" onClick={exportPdf}>Export PDF</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Employee</th>
                  <th className="p-2">Room</th>
                  <th className="p-2">Round</th>
                  <th className="p-2">Shift</th>
                  <th className="p-2">Scheduled</th>
                  <th className="p-2">Completed</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Late (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="p-2">{r.employee_name ?? "—"} <span className="text-xs text-muted-foreground">{r.employee_id ?? ""}</span></td>
                    <td className="p-2">{r.room_number}</td>
                    <td className="p-2">{r.round_index}</td>
                    <td className="p-2">{r.shift_label}</td>
                    <td className="p-2 tabular-nums">{fmtDateTime(r.scheduled_for)}</td>
                    <td className="p-2 tabular-nums">{r.completed_at ? fmtDateTime(r.completed_at) : ""}</td>
                    <td className="p-2"><span className={r.status === "completed" ? "text-green-600" : r.status === "overdue" ? "text-destructive" : ""}>{r.status}</span></td>
                    <td className="p-2 text-right tabular-nums">{r.late_minutes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
