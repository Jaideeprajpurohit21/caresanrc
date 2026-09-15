import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCode, Smartphone, X, Usb } from "lucide-react";
import { capabilityNote, detectCapabilities, DEFAULT_CAPABILITIES, type DeviceCapabilities } from "@/lib/capabilities";
import { QR_ENABLED } from "@/lib/features";

export function useCapabilities(): DeviceCapabilities {
  const [caps, setCaps] = useState<DeviceCapabilities>(DEFAULT_CAPABILITIES);
  useEffect(() => {
    setCaps(detectCapabilities());
  }, []);
  return caps;
}

/**
 * Capability-aware check-in chooser. Never blocks the user: whichever methods
 * the device supports are offered, plus a manual code entry as last resort.
 */
export function CheckInChooser({
  roomHint,
  onPickQr,
  onPickNfc,
  onManual,
  onClose,
  busy,
}: {
  roomHint?: string;
  onPickQr: () => void;
  onPickNfc: () => void;
  onManual: (code: string) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const caps = useCapabilities();
  const [showManual, setShowManual] = useState(false);
  const [code, setCode] = useState("");
  const qrAvailable = QR_ENABLED && caps.camera;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="font-semibold">Room check-in</div>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 p-6">
          {roomHint && <div className="text-center text-lg font-semibold">{roomHint}</div>}
          <p className="text-center text-sm text-muted-foreground">
            How would you like to check in?
          </p>

          {qrAvailable && (
            <Button size="lg" className="h-20 w-full text-base" onClick={onPickQr} disabled={busy}>
              <QrCode className="mr-2 h-6 w-6" /> Scan QR code
            </Button>
          )}

          <Button
            size="lg"
            variant={qrAvailable ? "outline" : "default"}
            className="h-20 w-full text-base"
            onClick={onPickNfc}
            disabled={busy}
          >
            {caps.webNfc ? <Smartphone className="mr-2 h-6 w-6" /> : <Usb className="mr-2 h-6 w-6" />}
            {caps.webNfc ? "Tap NFC tag" : "Use NFC reader"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">{capabilityNote(caps)}</p>

          <div className="pt-2">
            {!showManual ? (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowManual(true)}>
                Enter room code by hand
              </Button>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = code.trim();
                  if (v.length < 2) return;
                  setCode("");
                  onManual(v);
                }}
              >
                <Input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Tag or room code"
                  aria-label="Tag or room code"
                />
                <Button type="submit" disabled={busy || code.trim().length < 2}>
                  Check in
                </Button>
              </form>
            )}
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            {caps.os} · {caps.browser} · NFC {caps.webNfc ? "available" : "via reader"} · Camera{" "}
            {caps.camera ? "available" : "unavailable"}
          </p>
        </div>
      </div>
    </div>
  );
}
