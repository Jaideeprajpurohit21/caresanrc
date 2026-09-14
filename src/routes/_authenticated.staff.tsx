import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Camera, Smartphone, QrCode, X, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getMyStaffDashboard, submitRoundScan } from "@/lib/api/rounding.functions";
import { supabase } from "@/integrations/supabase/client";
import { RoomScanner, ScanResultCard, type ScanResult } from "@/components/RoomScanner";
import { NfcCheckIn, isNfcSupported } from "@/components/NfcCheckIn";
import { fmtTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Rounds — POC Rounding Portal" }] }),
  component: StaffPage,
});

const SESSION_MAX_HOURS = 12;
const SIGN_IN_KEY = "staff_signed_in_at";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StaffPage() {
  const getHome = useServerFn(getMyStaffDashboard);
  const scan = useServerFn(submitRoundScan);
  const qc = useQueryClient();
  const [mode, setMode] = useState<"closed" | "choose" | "qr" | "nfc">("closed");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const signedOutRef = useRef(false);
  const nfc = isNfcSupported();

  const { data } = useSuspenseQuery({
    queryKey: ["my-staff-dashboard"],
    queryFn: () => getHome({}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

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
    mutationFn: (vars: { qr_token: string; input_method: "qr" | "nfc" }) => scan({ data: vars }),
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
    onError: (e: any) => {
      console.error("submit_round_scan failed:", e);
      setLastResult({
        ok: false,
        code: "client_error",
        title: "Something went wrong",
        message: "We couldn't reach the server. Check your connection and try again.",
      });
      toast.error(e?.message ?? "Scan failed");
    },
  });

  if (mode === "choose") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold">Check in</div>
          <Button variant="ghost" onClick={() => setMode("closed")} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col justify-center gap-4 p-6 max-w-md w-full mx-auto">
          <p className="text-sm text-muted-foreground text-center">
            Choose how you want to check in to this room.
          </p>
          <Button size="lg" className="w-full h-20 text-base" onClick={() => setMode("qr")}>
            <QrCode className="h-6 w-6 mr-2" /> Scan QR code
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full h-20 text-base"
            onClick={() => setMode("nfc")}
          >
            <Smartphone className="h-6 w-6 mr-2" /> Scan NFC tag
          </Button>
          {!nfc && (
            <p className="text-xs text-muted-foreground text-center">
              On this device, NFC works through a connected tag reader.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (mode === "nfc") {
    return (
      <NfcCheckIn
        busy={mutate.isPending}
        onClose={() => setMode("choose")}
        onToken={(token) => {
          setMode("closed");
          mutate.mutate({ qr_token: token, input_method: "nfc" });
        }}
      />
    );
  }

  if (mode === "qr") {
    return (
      <RoomScanner
        lastResult={lastResult}
        onScan={(token) => {
          if (mutate.isPending) return;
          setMode("closed");
          mutate.mutate({ qr_token: token, input_method: "qr" });
        }}
        onClose={() => setMode("choose")}
      />
    );
  }


  return (
    <div className="mx-auto max-w-md p-4 space-y-4">
      {mutate.isPending && (
        <div className="rounded-lg border p-4 flex items-center gap-3 bg-muted/30">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <div className="text-sm">Checking…</div>
        </div>
      )}
      {!mutate.isPending && lastResult && (
        <ScanResultCard result={lastResult} onDismiss={() => setLastResult(null)} />
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}, {data.full_name || "there"}</h1>
        <p className="text-sm text-muted-foreground">
          Checked in {data.scans_today} {data.scans_today === 1 ? "time" : "times"} today
        </p>
      </div>

      <Button size="lg" className="w-full h-16 text-base" onClick={() => setMode("choose")}>
        <Camera className="h-6 w-6 mr-2" /> Check In
      </Button>
    </div>
  );
}
