/**
 * NFCReaderService — hardware abstraction for reading a tag identifier.
 *
 * Providers are independent of the rest of the app: whatever reads the tag,
 * the result is always a plain string identifier that the backend maps to a
 * room (`room_nfc_tags`), so no reader manufacturer is baked into the app.
 *
 *  - "web-nfc"        Web NFC (NDEFReader). Android Chromium over HTTPS only.
 *  - "keyboard-wedge" External USB/Bluetooth readers that "type" the tag UID
 *                     followed by Enter. Works on iPad/iPhone/desktop.
 *  - "web-bluetooth"  Placeholder for a future in-browser Bluetooth reader.
 *                     Capability is detected; no fake implementation is shipped.
 */

export type NfcProviderId = "web-nfc" | "keyboard-wedge" | "web-bluetooth";

export type NfcReadHandlers = {
  onTag: (identifier: string) => void;
  onError?: (message: string) => void;
};

/** Stop listening. */
export type NfcSubscription = () => void;

export function isWebNfcAvailable(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

/** Read one tag through Web NFC. Resolves once listening has started. */
export async function startWebNfc({ onTag, onError }: NfcReadHandlers): Promise<NfcSubscription> {
  // @ts-expect-error - Web NFC types are not in lib.dom yet
  const reader = new window.NDEFReader();
  await reader.scan();
  reader.onreading = (event: any) => {
    try {
      const record = event.message?.records?.[0];
      let id = "";
      if (record) {
        const decoder = new TextDecoder(record.encoding || "utf-8");
        id = decoder.decode(record.data);
      }
      if (!id && event.serialNumber) id = String(event.serialNumber);
      if (!id) {
        onError?.("Couldn't read that tag. Try tapping again.");
        return;
      }
      onTag(id);
    } catch {
      onError?.("Couldn't read that tag. Try tapping again.");
    }
  };
  reader.onreadingerror = () => onError?.("Couldn't read that tag. Try tapping again.");
  return () => {
    reader.onreading = null;
    reader.onreadingerror = null;
  };
}

/**
 * Capture an external reader that behaves like a keyboard: buffer printable
 * keystrokes and submit on Enter or after a short idle pause. Keystrokes typed
 * into a real input/textarea are ignored.
 */
export function startKeyboardWedge(
  { onTag }: NfcReadHandlers,
  options: { idleMs?: number; minLength?: number; enabled?: () => boolean } = {},
): NfcSubscription {
  if (typeof window === "undefined") return () => {};
  const idleMs = options.idleMs ?? 350;
  const minLength = options.minLength ?? 4;
  let buffer = "";
  let timer: number | null = null;

  const clear = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };

  const submit = () => {
    const value = buffer.trim();
    buffer = "";
    clear();
    if (value.length < minLength) return;
    onTag(value);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (options.enabled && !options.enabled()) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key.length !== 1) return;
    buffer += e.key;
    clear();
    timer = window.setTimeout(submit, idleMs);
  };

  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    clear();
  };
}

export function availableNfcProviders(): NfcProviderId[] {
  const out: NfcProviderId[] = ["keyboard-wedge"];
  if (isWebNfcAvailable()) out.unshift("web-nfc");
  return out;
}
