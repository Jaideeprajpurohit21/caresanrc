import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, XCircle } from "lucide-react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getMyFloorStatus, submitRoundScan } from "@/lib/api/rounding.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "My Rounds — POC Rounding Portal" }] }),
  component: StaffPage,
});

function StaffPage() {
  const getStatus = useServerFn(getMyFloorStatus);
  const scan = useServerFn(submitRoundScan);
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const signedOutRef = useRef(false);

  const { data } = useSuspenseQuery({
    queryKey: ["my-floor-status"],
    queryFn: () => getStatus({}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Realtime: refetch when any scan lands on this floor
  useEffect(() => {
    if (!data?.floor_id) return;
    const ch = supabase.channel(`scan_logs:${data.floor_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_logs", filter: `floor_id=eq.${data.floor_id}` },
        () => qc.invalidateQueries({ queryKey: ["my-floor-status"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [data?.floor_id, qc]);

  // Auto sign-out if shift over (no active/upcoming left)
  useEffect(() => {
    if (signedOutRef.current) return;
    const rows = data?.rows ?? [];
    if (rows.length > 0) {
      const stillRunning = rows.some((r: any) => r.status === "active" || r.status === "upcoming");
      if (!stillRunning) {
        signedOutRef.current = true;
        (async () => {
          await supabase.auth.signOut();
          toast.info("Signed out automatically — the shift ended.");
          window.location.href = "/auth";
        })();
      }
    }
  }, [data]);

  const mutate = useMutation({
    mutationFn: (qr_token: string) => scan({ data: { qr_token } }),
    onSuccess: (res: any) => {
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["my-floor-status"] });
      if (res.ok) toast.success(res.title);
      else toast.error(res.title);
      if (res.code === "off_shift" && !signedOutRef.current) {
        signedOutRef.current = true;
        (async () => {
          await supabase.auth.signOut();
          window.location.href = "/auth";
        })();
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan failed"),
  });

  if (!data?.floor_id) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card><CardContent className="p-6 text-center">
          <h1 className="font-bold text-lg mb-1">No floor assigned</h1>
          <p className="text-sm text-muted-foreground">Ask your administrator to assign you to a floor.</p>
        </CardContent></Card>
      </div>
    );
  }

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

  const rows = data.rows ?? [];

  return (
    <div className="mx-auto max-w-md p-4 space-y-4">
      {lastResult && (
        <Card className={lastResult.ok ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}>
          <CardContent className="p-4 flex items-start gap-3">
            {lastResult.ok ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{lastResult.title}</div>
              {lastResult.ok ? (
                <div className="text-sm text-muted-foreground mt-1">Room {lastResult.room_number}</div>
              ) : lastResult.message ? (
                <div className="text-sm text-muted-foreground mt-1">{lastResult.message}</div>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLastResult(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data.full_name || "My Rounds"}</h1>
        <p className="text-sm text-muted-foreground">{data.schedule?.shift_name ? `${data.schedule.shift_name} shift` : "No active shift"}</p>
      </div>

      <Button size="lg" className="w-full h-16 text-base" onClick={() => setScanning(true)}>
        <Camera className="h-6 w-6 mr-2" /> Scan QR code
      </Button>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">No rounds today.</li>}
            {rows.map((r: any) => {
              const label = r.status === "completed" ? "Done" : r.status === "overdue" ? "Missed" : "Pending";
              const tone = r.status === "completed" ? "default" : r.status === "overdue" ? "destructive" : "secondary";
              return (
                <li key={r.room_id} className="p-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="font-medium">Room {r.room_number}</div>
                  <Badge variant={tone as any}>{label}</Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
