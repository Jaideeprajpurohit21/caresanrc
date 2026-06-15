import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock, XCircle, AlertTriangle, ScanLine } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getMyTasksToday, scanRoomQr } from "@/lib/api/rounding.functions";
import { fmtTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "My Rounds — POC Rounding Portal" }] }),
  component: StaffPage,
});

type TaskBucket = "active" | "upcoming" | "completed" | "overdue";

function StaffPage() {
  const getTasks = useServerFn(getMyTasksToday);
  const scan = useServerFn(scanRoomQr);
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const { data } = useSuspenseQuery({
    queryKey: ["my-tasks"],
    queryFn: () => getTasks({}),
    refetchInterval: 30_000,
  });

  // re-render every 30s so windows roll over
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const tasks = data.tasks ?? [];
  const buckets = useMemo(() => {
    const now = Date.now();
    const out: Record<TaskBucket, any[]> = { active: [], upcoming: [], completed: [], overdue: [] };
    for (const t of tasks) {
      const start = new Date(t.scheduled_at).getTime();
      const end = new Date(t.window_end).getTime();
      if (t.status === "completed") out.completed.push(t);
      else if (t.status === "overdue") out.overdue.push(t);
      else if (now >= start && now <= end) out.active.push(t);
      else out.upcoming.push(t);
    }
    return out;
  }, [tasks]);

  const mutate = useMutation({
    mutationFn: (qr_token: string) => scan({ data: { qr_token, device_user_agent: navigator.userAgent } }),
    onSuccess: (res) => {
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan failed"),
  });

  if (scanning) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between p-3 text-white">
          <div className="font-semibold">Scan room QR</div>
          <Button variant="ghost" className="text-white" onClick={() => setScanning(false)}>Close</Button>
        </div>
        <div className="flex-1 relative">
          <Scanner
            onScan={(codes) => {
              const text = codes?.[0]?.rawValue;
              if (!text || mutate.isPending) return;
              setScanning(false);
              mutate.mutate(text);
            }}
            onError={(e) => console.error(e)}
            constraints={{ facingMode: "environment" }}
            styles={{ container: { height: "100%", width: "100%" }, video: { height: "100%", width: "100%", objectFit: "cover" } }}
            allowMultiple={false}
          />
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 aspect-square border-4 border-white/80 rounded-2xl pointer-events-none" />
        </div>
        <div className="p-4 text-white text-center text-sm">Point your camera at the room QR code</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      {lastResult && (
        <Card className={lastResult.ok ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}>
          <CardContent className="p-4 flex items-start gap-3">
            {lastResult.ok ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{lastResult.message}</div>
              {lastResult.ok ? (
                <div className="text-sm text-muted-foreground mt-1">
                  Room {lastResult.room_number} · {fmtTime(lastResult.completed_at)} · {lastResult.shift}
                </div>
              ) : lastResult.next_at ? (
                <div className="text-sm text-muted-foreground mt-1">Opens at {fmtTime(lastResult.next_at)}</div>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLastResult(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">My Rounds</h1>
          <p className="text-sm text-muted-foreground">Today · {data.assignments?.length ? data.assignments.map((a: any) => a.shifts?.name).join(", ") : "No shift assigned"}</p>
        </div>
        <Button size="lg" onClick={() => setScanning(true)} disabled={buckets.active.length === 0}>
          <Camera className="h-5 w-5 mr-2" /> Scan
        </Button>
      </div>

      <Section title="Active now" tasks={buckets.active} tone="active" emptyMsg="No rounds open right now." onScan={() => setScanning(true)} />
      <Section title="Upcoming" tasks={buckets.upcoming} tone="upcoming" emptyMsg="No more rounds scheduled." />
      <Section title="Completed" tasks={buckets.completed} tone="completed" emptyMsg="" />
      <Section title="Overdue" tasks={buckets.overdue} tone="overdue" emptyMsg="" />
    </div>
  );
}

function Section({ title, tasks, tone, emptyMsg, onScan }: { title: string; tasks: any[]; tone: TaskBucket; emptyMsg: string; onScan?: () => void }) {
  if (tasks.length === 0 && !emptyMsg) return null;
  const ToneIcon = tone === "active" ? Camera : tone === "completed" ? CheckCircle2 : tone === "overdue" ? AlertTriangle : Clock;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><ToneIcon className="h-4 w-4" /> {title}<Badge variant="secondary" className="ml-1">{tasks.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3">{emptyMsg}</div>
        ) : (
          <ul className="divide-y">
            {tasks.map((t) => (
              <li key={t.id} className="p-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">Room {t.rooms?.room_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.rooms?.floors?.units?.name} · {t.rooms?.floors?.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums">{fmtTime(t.scheduled_at)}</div>
                  {tone === "completed" && <div className="text-xs text-green-600">Done {fmtTime(t.completed_at)}</div>}
                  {tone === "active" && onScan && <Button size="sm" className="mt-1" onClick={onScan}><ScanLine className="h-3 w-3 mr-1" /> Scan</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
