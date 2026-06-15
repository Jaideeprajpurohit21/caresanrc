import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getMyStaffHome, submitRoundScan } from "@/lib/api/rounding.functions";
import { supabase } from "@/integrations/supabase/client";
import { RoomScanner, ScanResultCard, type ScanResult } from "@/components/RoomScanner";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "My Rounds — POC Rounding Portal" }] }),
  component: StaffPage,
});

// Auto sign-out after this many hours of being signed in (covers longest shift).
const SESSION_MAX_HOURS = 12;
const SIGN_IN_KEY = "staff_signed_in_at";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StaffPage() {
  const getHome = useServerFn(getMyStaffHome);
  const scan = useServerFn(submitRoundScan);
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const signedOutRef = useRef(false);

  const { data } = useSuspenseQuery({
    queryKey: ["my-staff-home"],
    queryFn: () => getHome({}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Session-length auto sign-out.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let startedAt = Number(sessionStorage.getItem(SIGN_IN_KEY));
    if (!startedAt) {
      startedAt = Date.now();
      sessionStorage.setItem(SIGN_IN_KEY, String(startedAt));
    }
    const maxMs = SESSION_MAX_HOURS * 60 * 60 * 1000;
    const check = async () => {
      if (signedOutRef.current) return;
      if (Date.now() - startedAt > maxMs) {
        signedOutRef.current = true;
        sessionStorage.removeItem(SIGN_IN_KEY);
        await supabase.auth.signOut();
        toast.info("Signed out automatically — your session has ended. Please sign in again.");
        window.location.href = "/auth";
      }
    };
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const mutate = useMutation({
    mutationFn: (qr_token: string) => scan({ data: { qr_token } }),
    onSuccess: async (res: any) => {
      setLastResult(res);
      qc.invalidateQueries({ queryKey: ["my-staff-home"] });
      if (res.ok) toast.success(res.title);
      else toast.error(res.title);
      if (res.code === "not_authenticated" && !signedOutRef.current) {
        signedOutRef.current = true;
        sessionStorage.removeItem(SIGN_IN_KEY);
        await supabase.auth.signOut();
        window.location.href = "/auth";
      }
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
    <div className="mx-auto max-w-md p-4 space-y-4">
      {lastResult && (
        <Card className={lastResult.ok ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}>
          <CardContent className="p-4 flex items-start gap-3">
            {lastResult.ok
              ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
              : <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{lastResult.title}</div>
              {lastResult.message ? (
                <div className="text-sm text-muted-foreground mt-1">{lastResult.message}</div>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLastResult(null)}>Back</Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}, {data.full_name || "there"}</h1>
        <p className="text-sm text-muted-foreground">
          Checked in {data.scans_today} {data.scans_today === 1 ? "time" : "times"} today
        </p>
      </div>

      <Button size="lg" className="w-full h-16 text-base" onClick={() => setScanning(true)}>
        <Camera className="h-6 w-6 mr-2" /> Scan QR code
      </Button>
    </div>
  );
}
