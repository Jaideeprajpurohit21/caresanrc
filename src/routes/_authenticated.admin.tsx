import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtTime } from "@/lib/format";
import { CheckCircle2, AlertTriangle, Clock, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin dashboard — POC Rounding Portal" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const fn = useServerFn(getDashboardStats);
  const { data } = useSuspenseQuery({
    queryKey: ["dashboard"],
    queryFn: () => fn({}),
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Today's compliance</h1>
        <p className="text-sm text-muted-foreground">Live rounding status across all assigned staff.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total due" value={data.totalDue} Icon={Clock} />
        <Stat label="Completed" value={data.completed} Icon={CheckCircle2} tone="green" />
        <Stat label="Overdue" value={data.overdue} Icon={AlertTriangle} tone="red" />
        <Stat label="Late" value={data.late} Icon={Clock} tone="amber" />
        <Stat label="Compliance" value={`${data.compliance}%`} Icon={TrendingUp} tone="primary" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Currently overdue rooms</CardTitle></CardHeader>
          <CardContent>
            {data.overdueRooms.length === 0 ? (
              <div className="text-sm text-muted-foreground">No overdue rooms — nice.</div>
            ) : (
              <ul className="divide-y text-sm">
                {data.overdueRooms.map((r: any, i: number) => (
                  <li key={i} className="py-2 flex justify-between"><span>Room {r.room_number}</span><span className="tabular-nums text-muted-foreground">{fmtTime(r.scheduled_at)}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Employee performance (today)</CardTitle></CardHeader>
          <CardContent>
            {data.perEmployee.length === 0 ? (
              <div className="text-sm text-muted-foreground">No assignments scheduled today.</div>
            ) : (
              <ul className="divide-y text-sm">
                {data.perEmployee.map((e: any, i: number) => (
                  <li key={i} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{e.emp}</div>
                    </div>
                    <div className="text-right tabular-nums">
                      {e.completed}/{e.total}
                      {e.overdue > 0 && <span className="ml-2 text-destructive">{e.overdue} overdue</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, Icon, tone }: { label: string; value: any; Icon: any; tone?: "green" | "red" | "amber" | "primary" }) {
  const toneClass =
    tone === "green" ? "text-green-600 bg-green-500/10"
    : tone === "red" ? "text-destructive bg-destructive/10"
    : tone === "amber" ? "text-amber-600 bg-amber-500/10"
    : tone === "primary" ? "text-primary bg-primary/10"
    : "text-muted-foreground bg-muted";
  return (
    <Card>
      <CardContent className="p-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <div className={`h-9 w-9 rounded-md grid place-items-center ${toneClass}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
