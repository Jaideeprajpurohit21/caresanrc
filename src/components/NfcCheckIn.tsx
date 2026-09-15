import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smartphone, X, Usb } from "lucide-react";
import { startKeyboardWedge, startWebNfc, isWebNfcAvailable } from "@/lib/nfc-reader-service";

export function isNfcSupported(): boolean {
  return isWebNfcAvailable();
}

export function NfcCheckIn({
  onToken,
  onClose,
  busy,
}: {
  onToken: (token: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [supported, setSupported] = useState(false);
  const submittedRef = useRef(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    setSupported(isWebNfcAvailable());
  }, []);

  // External readers (USB or Bluetooth) usually behave like a keyboard.
  useEffect(() => {
    return startKeyboardWedge(
      {
        onTag: (id) => {
          if (submittedRef.current) return;
          submittedRef.current = true;
          onToken(id);
        },
      },
      { enabled: () => !busyRef.current && !submittedRef.current },
    );
  }, [onToken]);

  async function startNfcCheckIn() {
    setError(null);
    try {
      const stop = await startWebNfc({
        onTag: (id) => {
          stop();
          setListening(false);
          if (submittedRef.current) return;
          submittedRef.current = true;
          onToken(id);
        },
        onError: (m) => setError(m),
      });
      setListening(true);
    } catch {
      setListening(false);
      setError(
        "NFC couldn't start on this device — permission may be off. You can go back and scan the room QR code instead.",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="font-semibold">{supported ? "Tap to check in" : "NFC reader check-in"}</div>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 overflow-y-auto">
        <div className={`rounded-full p-8 ${listening || !supported ? "bg-primary/10 animate-pulse" : "bg-muted"}`}>
          {supported ? (
            <Smartphone className="h-20 w-20 text-primary" />
          ) : (
            <Usb className="h-20 w-20 text-primary" />
          )}
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-semibold">
            {supported
              ? listening
                ? "Ready — tap the tag"
                : "Hold your phone near the room NFC tag"
              : "Waiting for the reader — hold the tag against it"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {supported
              ? listening
                ? "Hold the back of your device against the NFC tag on the door."
                : "Press Start, then hold the back of your device against the room's NFC tag."
              : "This device reads tags through a connected NFC reader. Hold the tag against the reader — the check-in happens automatically. You can also go back and scan the room QR code."}
          </p>
        </div>
        {error && (
          <div className="rounded-lg border border-muted bg-muted/40 p-3 text-sm max-w-sm">{error}</div>
        )}
        {supported && !listening && (
          <Button size="lg" className="h-14 px-8 text-base" onClick={startNfcCheckIn} disabled={busy}>
            {error ? "Try again" : "Start"}
          </Button>
        )}

        <div className="w-full max-w-sm space-y-3">
          {!showManual ? (
            <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
              Enter code by hand
            </Button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = manual.trim();
                if (v.length < 2) return;
                setManual("");
                onToken(v);
              }}
            >
              <Input
                autoFocus
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Tag or room code"
                aria-label="Tag or room code"
              />
              <Button type="submit" disabled={busy || manual.trim().length < 2}>
                Check in
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
