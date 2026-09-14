import type { BoardId } from "@/v2/contracts/screen";

type NotBuiltProps = {
  board: BoardId;
  title: string;
};

export function NotBuilt({ board, title }: NotBuiltProps) {
  return (
    <section className="v2-mono v2-placeholder" data-testid={`v2-placeholder-${board}`}>
      <p aria-label="Board id">{board}</p>
      <h1>{title}</h1>
      <p>This screen is not built yet.</p>
    </section>
  );
}
