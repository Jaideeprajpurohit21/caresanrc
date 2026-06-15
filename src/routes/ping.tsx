import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ping")({
  component: () => <div>pong</div>,
});
