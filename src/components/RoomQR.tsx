import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function RoomQR({ token, size = 96 }: { token: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, String(token), {
        width: size,
        margin: 1,
      }).catch(() => {});
    }
  }, [token, size]);
  return <canvas ref={ref} className="bg-white" style={{ width: size, height: size }} />;
}
