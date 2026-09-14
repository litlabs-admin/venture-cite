import { createFileRoute } from "@tanstack/react-router";

// The approved 47-screen design canvas, served as a static page from
// client/public/canvas/screens.html and framed full-viewport.
export const Route = createFileRoute("/canvas")({
  head: () => ({
    meta: [{ title: "VentureCite screens canvas" }, { name: "robots", content: "noindex" }],
  }),
  component: CanvasPage,
});

function CanvasPage() {
  return (
    <iframe
      src="/canvas/screens.html"
      title="VentureCite screens canvas"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
    />
  );
}
