import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, X } from "lucide-react";

export type ScanResult = {
  ok: boolean;
  code: string;
  title: string;
  message?: string;
  [k: string]: any;
};

export type CloseContext = "popup" | "iframe" | "tab";

/**
 * Best-effort "return to PointClickCare" close handler.
 * Tries in order: window.close() for popups, postMessage for iframes,
 * and an explicit close-tab fallback message.
 */
function attemptClose(lastResult: ScanResult | null): CloseContext {
  if (typeof window === "undefined") return "tab";
  // 1) Popup opened via window.open()
  try {
    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(
          { type: "rounding-portal-scan-complete", result: lastResult },
          "*",
        );
      } catch { /* opener may be cross-origin */ }
      window.close();
      return "popup";
    }
  } catch { /* ignore */ }
  // 2) Embedded inside an iframe
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "rounding-portal-scan-complete", result: lastResult },
        "*",
      );
      return "iframe";
    }
  } catch { /* ignore */ }
  // 3) Plain new tab
  try { window.close(); } catch { /* ignore */ }
  return "tab";
}

export function RoomScanner({
  onScan,
  onClose,
  lastResult,
}: {
  onScan: (qr_token: string) => void;
  onClose: () => void;
  lastResult: ScanResult | null;
}) {
  const [closeMessage, setCloseMessage] = useState<CloseContext | null>(null);

  const handleClose = () => {
    const ctx = attemptClose(lastResult);
    if (ctx === "iframe" || ctx === "tab") {
      // Popup window.close() usually succeeds and the tab is already gone;
      // for iframe / plain-tab cases show a fallback message + onClose.
      setCloseMessage(ctx);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <div className="font-semibold">Scan room QR</div>
        <Button variant="ghost" className="text-white" onClick={handleClose} aria-label="Close scanner">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 relative">
        <Scanner
          onScan={(codes) => {
            const text = codes?.[0]?.rawValue;
            if (!text) return;
            onScan(text);
          }}
          onError={(e) => console.error(e)}
          constraints={{ facingMode: "environment" }}
          styles={{
            container: { height: "100%", width: "100%" },
            video: { height: "100%", width: "100%", objectFit: "cover" },
          }}
          allowMultiple={false}
        />
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 aspect-square border-4 border-white/80 rounded-2xl pointer-events-none" />
      </div>
      <div className="p-4 text-white text-center text-sm">
        Point your camera at the room QR code
      </div>
      {closeMessage && (
        <ReturnToPCCOverlay context={closeMessage} onDismiss={() => setCloseMessage(null)} />
      )}
    </div>
  );
}

/** Visible fallback shown when window.close() can't actually close the view. */
export function ReturnToPCCOverlay({
  context, onDismiss,
}: { context: CloseContext; onDismiss: () => void }) {
  return (
    <div className="absolute inset-0 z-10 bg-black/80 grid place-items-center p-6">
      <div className="bg-card text-foreground rounded-lg p-6 max-w-sm text-center space-y-3">
        <h2 className="font-semibold text-lg">You can return to PointClickCare</h2>
        <p className="text-sm text-muted-foreground">
          {context === "iframe"
            ? "This scanner is embedded — switch back to the PointClickCare tab to continue."
            : "Your scan was recorded. You can close this tab and return to PointClickCare."}
        </p>
        <div className="flex justify-center gap-2 pt-2">
          {context === "tab" && (
            <Button onClick={() => { try { window.close(); } catch { /* ignore */ } }}>
              Close tab
            </Button>
          )}
          <Button variant="outline" onClick={onDismiss}>Stay here</Button>
        </div>
      </div>
    </div>
  );
}

/** Inline success/error card used by both /staff and /scan. */
export function ScanResultCard({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${result.ok ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
      {result.ok
        ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
        : <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{result.title}</div>
        {result.message ? (
          <div className="text-sm text-muted-foreground mt-1">{result.message}</div>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>Back</Button>
    </div>
  );
}

// Auto-noop export so tree-shaking doesn't strip the effect import in case
// downstream lint rules complain about React import.
export const __noop = () => useEffect(() => undefined, []);
