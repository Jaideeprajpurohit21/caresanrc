import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { listRooms } from "@/lib/api/rounding.functions";
import { DoorLabel, doorLabelPrintCss } from "@/components/DoorLabel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/rooms/labels")({
  head: () => ({ meta: [{ title: "Print door labels" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listRooms);
  const { data } = useSuspenseQuery({ queryKey: ["rooms"], queryFn: () => fn({}) });
  const rooms = (data ?? []) as any[];

  return (
    <>
      <style>{doorLabelPrintCss}</style>
      <div className="no-print max-w-3xl mx-auto p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Door labels — {rooms.length} rooms</h1>
        <Button onClick={() => window.print()}>Print all</Button>
      </div>
      {rooms.map((r) => <DoorLabel key={r.id} room={r} />)}
    </>
  );
}
