import { createFileRoute } from "@tanstack/react-router";
import { BOARD_IDS, SCREENS } from "@/v2/screens/registry";

function V2PreviewIndex() {
  return (
    <main className="v2-mono" style={{ width: "1440px", margin: "0 auto" }}>
      <h1>V2 screen preview</h1>
      <ul>
        {BOARD_IDS.map((board) => (
          <li key={board}>
            <a href={`/v2-preview/${board}`}>
              {board} - {SCREENS[board].title}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

export const Route = createFileRoute("/v2-preview/")({
  component: V2PreviewIndex,
});
