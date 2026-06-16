import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Radio } from "lucide-react";
import { toast } from "sonner";
import { isNfcSupported } from "./NfcCheckIn";

export function NfcTagWriter({ token, roomNumber }: { token: string; roomNumber: string }) {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = isNfcSupported();

  async function writeTag() {
    setError(null);
    setWriting(true);
    try {
      // @ts-expect-error - Web NFC types not in lib.dom
      const writer = new window.NDEFReader();
      await writer.write({ records: [{ recordType: "text", data: token }] });
      toast.success(`Tag written for Room ${roomNumber}`);
    } catch (e: any) {
      const msg = e?.message || "Couldn't write the tag. Hold the blank tag against the back of your device and try again.";
      setError(msg);
      toast.error("NFC write failed");
    } finally {
      setWriting(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Token copied");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/20">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        NFC tag
      </div>
      <div className="text-[11px] text-muted-foreground">Tag content (for writing NFC tags):</div>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 text-xs bg-background border rounded px-2 py-1 font-mono break-all select-all"
          onClick={(e) => {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }}
        >
          {token}
        </code>
        <Button variant="outline" size="sm" onClick={copyToken}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {supported ? (
        <>
          <Button size="sm" onClick={writeTag} disabled={writing}>
            <Radio className="h-4 w-4 mr-1" />
            {writing ? "Hold tag near device…" : "Write to NFC tag"}
          </Button>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </>
      ) : (
        <div className="text-xs text-muted-foreground leading-relaxed">
          Your device can't write NFC tags directly. Copy the token above, open a free app like{" "}
          <strong>NFC Tools</strong> (App Store or Play Store), choose <strong>Write → Add a record → Text record</strong>,
          paste the token, then hold a blank tag to your phone.
        </div>
      )}
    </div>
  );
}
