import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, XCircle, Info, RefreshCw } from "lucide-react";
import {
  listRooms,
  submitRoundScanDryRun,
  getScanErrorSummary,
  listRecentScanErrors,
} from "@/lib/api/rounding.functions";

export const Route = createFileRoute("/_authenticated/admin/diagnostics")({
  head: () => ({ meta: [{ title: "Diagnostics — Admin" }] }),
  component: Page,
});

const CODE_EXPLANATIONS: Record<string, string> = {
  off_shift:
    "No active shift is configured to be running right now for this room's floor. Check the Rounding Schedule page.",
  no_schedule:
    "This floor has no active rounding schedule at all. Create one on the Rounding Schedule page.",
  not_due:
    "There's an active schedule, but no round is open for this room right now. See 'Next window opens at' above — this is expected behavior outside a round window, not a bug.",
  completed:
    "Everything is working — a real scan right now would succeed.",
  active:
    "Everything is working — a real scan right now would succeed.",
  already_done:
    "A round is open, but it was already completed in this window — also expected if you've already tested this room.",
  expired:
    "The most recent window closed without a scan and is recorded as missed. See 'Next window opens at' above for the next chance.",
  unknown_qr:
    "This QR token isn't registered to any room — the room may have been deleted.",
  not_authenticated:
    "Your admin session expired. Sign in again.",
};

function formatLocal(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function Page() {
  const lRooms = useServerFn(listRooms);
  const dryRun = useServerFn(submitRoundScanDryRun);
  const { data: rooms } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => lRooms({}) });
  const [token, setToken] = useState("");
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => dryRun({ data: { qr_token: token } }),
    onSuccess: (r) => { setResult(r); setErrorMsg(null); },
    onError: (e: any) => { setResult(null); setErrorMsg(e?.message ?? "Request failed"); },
  });

  const sorted = [...(rooms ?? [])].sort((a: any, b: any) =>
    String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }),
  );

  const ok = result?.ok === true;
  const code = result?.code as string | undefined;
  const explanation = code ? CODE_EXPLANATIONS[code] : null;

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Diagnostics — Test scan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Simulate a scan to verify schedule configuration, room lookup, and window timing
          without needing a printed QR code, a staff phone, or a real check-in.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Run test scan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={token} onValueChange={setToken}>
            <SelectTrigger><SelectValue placeholder="Choose a room" /></SelectTrigger>
            <SelectContent>
              {sorted.map((r: any) => (
                <SelectItem key={r.id} value={r.qr_token}>
                  Room {r.room_number} — {r.floors?.facilities?.name} · {r.floors?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Dry run only</div>
              <div className="text-muted-foreground">
                This does not check anyone in and does not affect reports.
              </div>
            </div>
          </div>

          <Button
            disabled={!token || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? "Running…" : "Run test scan (no data changes)"}
          </Button>
        </CardContent>
      </Card>

      {errorMsg && (
        <Card>
          <CardContent className="pt-6 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <div className="font-semibold">Request failed</div>
              <div className="text-sm text-muted-foreground">{errorMsg}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {ok
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-destructive" />}
              Result
              {code && <Badge variant="outline" className="font-mono text-xs">{code}</Badge>}
              {result.dry_run && <Badge variant="secondary">dry run</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground">What the CNA would see</div>
              <div className="font-semibold mt-1">{result.title}</div>
              {result.message && (
                <div className="text-muted-foreground mt-1">{result.message}</div>
              )}
            </div>

            {result.next_window_starts && (
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs uppercase text-muted-foreground">Next window opens at</div>
                <div className="font-medium mt-1">{formatLocal(result.next_window_starts)}</div>
              </div>
            )}

            {explanation && (
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="text-muted-foreground">{explanation}</div>
              </div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Raw response</summary>
              <pre className="mt-2 rounded bg-muted p-2 overflow-x-auto">
{JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
