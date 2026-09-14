import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smartphone, X, Usb } from "lucide-react";

export function isNfcSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
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
  const supported = isNfcSupported();

  // External reader capture: most readers act as a keyboard and "type" the
  // tag serial, ending with Enter. Buffer keystrokes and submit on Enter or
  // after a short idle pause.
  const bufferRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const submit = () => {
      const value = bufferRef.current.trim();
      bufferRef.current = "";
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (value.length < 4 || submittedRef.current) return;
      submittedRef.current = true;
      onToken(value);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (busy || submittedRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key.length !== 1) return;
      bufferRef.current += e.key;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(submit, 350);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [busy, onToken]);

  async function startNfcCheckIn() {
    setError(null);
    try {
      // @ts-expect-error - Web NFC types are not in lib.dom yet
      const reader = new window.NDEFReader();
      await reader.scan();
      setListening(true);
      reader.onreading = (event: any) => {
        try {
          const record = event.message?.records?.[0];
          let token = "";
          if (record) {
            const decoder = new TextDecoder(record.encoding || "utf-8");
            token = decoder.decode(record.data);
          }
          if (!token && event.serialNumber) token = String(event.serialNumber);
          reader.onreading = null;
          setListening(false);
          if (!token) {
            setError("Couldn't read that tag. Try tapping again.");
            return;
          }
          onToken(token);
        } catch {
          setError("Couldn't read that tag. Try tapping again.");
        }
      };
      reader.onreadingerror = () => {
        setError("Couldn't read that tag. Try tapping again.");
      };
    } catch {
      setListening(false);
      setError(
        "NFC permission was denied, or NFC is turned off on this device. Enable NFC in your device settings and try again.",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="font-semibold">Tap to check in</div>
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
                : "Tap your device to the tag in the room"
              : "Waiting for the reader — hold the tag against it"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {supported
              ? listening
                ? "Hold the back of your device against the NFC tag on the door."
                : "Press Start, then hold the back of your device against the room's NFC tag."
              : "This device reads tags through the NFC reader connected to it. Hold the tag against the reader — the check-in happens automatically."}
          </p>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive max-w-sm">
            {error}
          </div>
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
