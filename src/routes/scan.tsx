import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { submitRoundScan } from "@/lib/api/rounding.functions";
import { RoomScanner, ScanResultCard, type ScanResult } from "@/components/RoomScanner";
import { NfcCheckIn, isNfcSupported } from "@/components/NfcCheckIn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/scan")({
  ssr: false,
  head: () => ({ meta: [{ title: "Scan — POC Rounding Portal" }] }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const scan = useServerFn(submitRoundScan);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"closed" | "choose" | "qr" | "nfc">("choose");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const nfc = isNfcSupported();

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
      setScanning(false);
      if (res.ok) toast.success(res.title);
      else toast.error(res.title);
      if (res.code === "not_authenticated") {
        await supabase.auth.signOut();
        navigate({ to: "/auth", search: { redirect: "/scan" } as any, replace: true });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan failed"),
  });

  if (!ready) return null;

  if (scanning) {
    if (nfc) {
      return (
        <NfcCheckIn
          busy={mutate.isPending}
          onClose={() => setScanning(false)}
          onToken={(token) => mutate.mutate({ qr_token: token, input_method: "nfc" })}
        />
      );
    }
    return (
      <RoomScanner
        lastResult={lastResult}
        onScan={(token) => {
          if (mutate.isPending) return;
          mutate.mutate({ qr_token: token, input_method: "qr" });
        }}
        onClose={() => setScanning(false)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md p-4 space-y-3 min-h-screen">
      {lastResult && <ScanResultCard result={lastResult} onDismiss={() => setLastResult(null)} />}
      <Button className="w-full" onClick={() => setScanning(true)}>
        {nfc ? "Tap another" : "Scan another"}
      </Button>
    </div>
  );
}
