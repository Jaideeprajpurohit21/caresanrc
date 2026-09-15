// Device capability detection for the check-in screen.
// Capability is detected, never assumed — the app stays usable either way.

export type DeviceCapabilities = {
  os: "iOS" | "iPadOS" | "Android" | "Windows" | "macOS" | "Other";
  browser: "Safari" | "Chrome" | "Edge" | "Firefox" | "Samsung Internet" | "Other";
  deviceType: "phone" | "tablet" | "desktop";
  /** Web NFC (NDEFReader) — Android Chromium only, over HTTPS. */
  webNfc: boolean;
  /** Camera access for QR scanning. */
  camera: boolean;
  /** Web Bluetooth — needed for a future in-browser Bluetooth NFC reader. */
  bluetooth: boolean;
  /** Secure context (HTTPS or localhost). Required by NFC/camera/Bluetooth. */
  secure: boolean;
  online: boolean;
};

export const DEFAULT_CAPABILITIES: DeviceCapabilities = {
  os: "Other",
  browser: "Other",
  deviceType: "desktop",
  webNfc: false,
  camera: false,
  bluetooth: false,
  secure: true,
  online: true,
};

export function detectCapabilities(): DeviceCapabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return DEFAULT_CAPABILITIES;
  }
  const ua = navigator.userAgent || "";
  const maxTouch = (navigator as any).maxTouchPoints ?? 0;

  const isIPhone = /iPhone|iPod/.test(ua);
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1);
  const isAndroid = /Android/.test(ua);

  const os: DeviceCapabilities["os"] = isIPhone
    ? "iOS"
    : isIPad
      ? "iPadOS"
      : isAndroid
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : "Other";

  const browser: DeviceCapabilities["browser"] = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome|CriOS/.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : "Other";

  const deviceType: DeviceCapabilities["deviceType"] = isIPad
    ? "tablet"
    : isIPhone
      ? "phone"
      : isAndroid
        ? /Mobile/.test(ua)
          ? "phone"
          : "tablet"
        : "desktop";

  return {
    os,
    browser,
    deviceType,
    webNfc: "NDEFReader" in window,
    camera: !!navigator.mediaDevices?.getUserMedia,
    bluetooth: !!(navigator as any).bluetooth,
    secure: window.isSecureContext !== false,
    online: navigator.onLine !== false,
  };
}

/** Short, non-alarming explanation of the device's check-in options. */
export function capabilityNote(c: DeviceCapabilities): string {
  if (c.webNfc) return "This device can tap NFC tags directly, and QR scanning also works.";
  if (c.camera)
    return "NFC tapping isn't available in this browser. You can scan the room QR code instead, or use a connected NFC reader.";
  return "Scan with a connected NFC reader, or enter the room code by hand.";
}
