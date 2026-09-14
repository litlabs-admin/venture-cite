import { createFileRoute } from "@tanstack/react-router";
import { isBoardId, SCREENS } from "@/v2/screens/registry";

function PreviewNotFound({ detail }: { detail: string }) {
  return (
    <main className="v2-mono" style={{ width: "1440px", margin: "0 auto" }}>
      <h1>404 Not found</h1>
      <p>{detail}</p>
    </main>
  );
}

function V2PreviewBoard() {
  const { board } = Route.useParams();
  if (!import.meta.env.DEV) {
    return <PreviewNotFound detail="Screen preview is available only in development." />;
  }
  if (!isBoardId(board)) {
    return <PreviewNotFound detail={`Board ${board} does not exist.`} />;
  }
  const entry = SCREENS[board];
  const Screen = entry.Screen;
  return (
    <div className="v2-mono" style={{ width: "1440px", minHeight: "100vh", margin: "0 auto" }}>
      <Screen data={entry.fixture} />
    </div>
  );
}

export const Route = createFileRoute("/v2-preview/$board")({
  component: V2PreviewBoard,
});
