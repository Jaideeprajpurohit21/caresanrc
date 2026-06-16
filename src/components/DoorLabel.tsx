import { RoomQR } from "@/components/RoomQR";

/**
 * 4"×6" door label. One per page when printed.
 * Renders only:
 *   - large "Room {number}"
 *   - centered QR (~2in square at print)
 *   - "Scan to check in" caption
 * No facility branding, no PHI, no schedule info.
 */
export function DoorLabel({ room }: { room: { room_number: string; qr_token: string } }) {
  return (
    <div className="door-label">
      <div className="room-num">Room {room.room_number}</div>
      <div className="qr-wrap">
        {/* 384px @ 96dpi ≈ 4in source bitmap, scaled to 2in via CSS for crisp print */}
        <RoomQR token={room.qr_token} size={384} />
      </div>
      <div className="caption">Scan to check in</div>
    </div>
  );
}

/** Print stylesheet — include once per page that renders DoorLabel(s). */
export const doorLabelPrintCss = `
  @page { size: 4in 6in; margin: 0.25in; }
  @media print {
    html, body { background: white !important; }
    .no-print { display: none !important; }
  }
  .door-label {
    width: 3.5in;
    height: 5.5in;
    margin: 0 auto;
    padding: 0.25in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    background: white;
    color: black;
    page-break-after: always;
    break-after: page;
  }
  .door-label:last-child { page-break-after: auto; break-after: auto; }
  .door-label .room-num {
    font-size: 48pt;
    font-weight: 800;
    letter-spacing: -0.01em;
    text-align: center;
    line-height: 1.1;
  }
  .door-label .qr-wrap canvas {
    width: 2in !important;
    height: 2in !important;
  }
  .door-label .caption {
    font-size: 14pt;
    font-weight: 500;
    text-align: center;
  }
  @media screen {
    .door-label {
      border: 1px dashed #ccc;
      margin: 1rem auto;
    }
  }
`;
