import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { listRooms } from "@/lib/api/rounding.functions";
import { DoorLabel, doorLabelPrintCss } from "@/components/DoorLabel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/rooms/$roomId/label")({
  head: () => ({ meta: [{ title: "Door label" }] }),
  component: Page,
});

function Page() {
  const { roomId } = Route.useParams();
  const fn = useServerFn(listRooms);
  const { data } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => fn({}) });
  const room = (data ?? []).find((r: any) => r.id === roomId);

  if (!room) {
    return <div className="p-6">Room not found.</div>;
  }

  return (
    <>
      <style>{doorLabelPrintCss}</style>
      <div className="no-print max-w-3xl mx-auto p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Door label — Room {room.room_number}</h1>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <DoorLabel room={room} />
    </>
  );
}
