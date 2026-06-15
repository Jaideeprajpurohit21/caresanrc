import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { listRooms } from "@/lib/api/rounding.functions";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/rooms/print")({
  head: () => ({ meta: [{ title: "Print QR sheet" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listRooms);
  const { data } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => fn({}) });
  return (
    <div className="p-4">
      <div className="max-w-5xl mx-auto print:hidden mb-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">QR sheet — {(data ?? []).length} rooms</h1>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {(data ?? []).map((r: any) => <QRCard key={r.id} room={r} />)}
      </div>
    </div>
  );
}

function QRCard({ room }: { room: any }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, `rounding://room/${room.qr_token}`, { width: 220, margin: 1 }).catch(() => {});
    }
  }, [room.qr_token]);
  return (
    <div className="border rounded-md p-3 text-center bg-white text-black break-inside-avoid">
      <canvas ref={ref} className="mx-auto" />
      <div className="mt-2 font-bold text-lg">Room {room.room_number}</div>
      <div className="text-xs text-gray-600">{room.floors?.units?.name} · {room.floors?.name}</div>
    </div>
  );
}
