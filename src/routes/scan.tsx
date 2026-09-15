import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { submitRoundScan } from "@/lib/api/rounding.functions";
import { RoomScanner, ScanResultCard, type ScanResult } from "@/components/RoomScanner";
import { NfcCheckIn } from "@/components/NfcCheckIn";
import { CheckInChooser } from "@/components/CheckInChooser";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/scan")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Check in — POC Rounding Portal" },
      { name: "description", content: "Check in to a resident room by scanning its QR code or tapping its NFC tag." },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const scan = useServerFn(submitRoundScan);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"closed" | "choose" | "qr" | "nfc">("choose");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const { code } = Route.useSearch();
  const autoSent = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate({ to: "/auth", search: { redirect: "/scan" } as any, replace: true });
        return;
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [navigate]);

  const mutate = useMutation({
    mutationFn: (vars: { qr_token: string; input_method: "qr" | "nfc" }) => scan({ data: vars }),
    onSuccess: async (res: any) => {
      setLastResult(res);
      setMode("closed");
      if (res.ok) toast.success(res.title);
      else toast.error(res.title);
      if (res.code === "not_authenticated") {
        await supabase.auth.signOut();
        navigate({ to: "/auth", search: { redirect: "/scan" } as any, replace: true });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan failed"),
  });

  // A reader or shortcut can open /scan?code=<tag serial or room code>.
  useEffect(() => {
    if (!ready || !code || autoSent.current) return;
    autoSent.current = true;
    setMode("closed");
    mutate.mutate({ qr_token: code, input_method: "nfc" });
  }, [ready, code, mutate]);

  if (!ready) return null;

  if (mode === "choose") {
    return (
      <CheckInChooser
        busy={mutate.isPending}
        onClose={() => setMode("closed")}
        onPickQr={() => setMode("qr")}
        onPickNfc={() => setMode("nfc")}
        onManual={(c) => {
          setMode("closed");
          mutate.mutate({ qr_token: c, input_method: "nfc" });
        }}
      />
    );
  }

  if (mode === "nfc") {
    return (
      <NfcCheckIn
        busy={mutate.isPending}
        onClose={() => setMode("choose")}
        onToken={(token) => mutate.mutate({ qr_token: token, input_method: "nfc" })}
      />
    );
  }

  if (mode === "qr") {
    return (
      <RoomScanner
        lastResult={lastResult}
        onScan={(token) => {
          if (mutate.isPending) return;
          mutate.mutate({ qr_token: token, input_method: "qr" });
        }}
        onClose={() => setMode("choose")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md p-4 space-y-3 min-h-screen">
      {lastResult && <ScanResultCard result={lastResult} onDismiss={() => setLastResult(null)} />}
      <Button className="w-full" onClick={() => setMode("choose")}>
        Check in again
      </Button>
    </div>
  );
}
