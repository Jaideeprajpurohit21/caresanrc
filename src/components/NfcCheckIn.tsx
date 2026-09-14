import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, X } from "lucide-react";

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
  const supported = isNfcSupported();

  async function startNfcCheckIn() {
    setError(null);
    try {
      // @ts-expect-error - Web NFC types are not in lib.dom yet
      const reader = new window.NDEFReader();
      await reader.scan();
      setListening(true);
      reader.onreading = (event: any) => {
        try {
          const record = event.message.records[0];
          const decoder = new TextDecoder(record.encoding || "utf-8");
          const token = decoder.decode(record.data);
          reader.onreading = null;
          setListening(false);
          onToken(token);
        } catch (e: any) {
          setError("Couldn't read that tag. Try tapping again.");
        }
      };
      reader.onreadingerror = () => {
        setError("Couldn't read that tag. Try tapping again.");
      };
    } catch (err: any) {
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className={`rounded-full p-8 ${listening ? "bg-primary/10 animate-pulse" : "bg-muted"}`}>
          <Smartphone className="h-20 w-20 text-primary" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-semibold">
            {listening ? "Ready — tap the tag" : "Tap your device to the tag in the room"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {listening
              ? "Hold the back of your device against the NFC tag on the door."
              : "Press Start, then hold the back of your device against the room's NFC tag."}
          </p>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive max-w-sm">
            {error}
          </div>
        )}
        {!supported && (
          <div className="rounded-lg border p-3 text-sm text-muted-foreground max-w-sm">
            This device or browser can't read NFC tags. Use an Android phone with Chrome, or go back and
            scan the room's QR code instead.
          </div>
        )}
        {supported && !listening && (
          <Button size="lg" className="h-14 px-8 text-base" onClick={startNfcCheckIn} disabled={busy}>
            {error ? "Try again" : "Start"}
          </Button>
        )}
        {!supported && (
          <Button size="lg" variant="outline" className="h-14 px-8 text-base" onClick={onClose}>
            Go back
          </Button>
        )}
      </div>
    </div>
  );
}
