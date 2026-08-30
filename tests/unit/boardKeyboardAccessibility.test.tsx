// @vitest-environment happy-dom
//
// B9 UI/UX remainder (B7-20): client/src/pages/internal/Board.tsx (the
// public/shared kanban rendered at /internal-page) had the largest
// remaining accessibility gap in the audit:
//
//   1. TicketCard had no tabIndex/role/onKeyDown - a keyboard user could not
//      open a ticket at all.
//   2. Moving a ticket between columns was native HTML5 drag-and-drop only -
//      no keyboard path, no button alternative, no reliable touch support.
//   3. The ticket dialog was a hand-rolled `fixed inset-0` div with a manual
//      `window` keydown listener for Escape - no `role="dialog"`, no focus
//      trap.
//   4. Delete fired the mutation immediately on click, with no confirmation,
//      on a board the file's own header comment describes as shared/public
//      with no undo.
//
// This test drives the real `Board` component (mocking only the network
// layer) and proves each of the four fixes.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Board } from "@/pages/internal/Board";
import type { Ticket } from "@/pages/internal/types";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t-1",
    title: "Fix the thing",
    detail: "",
    kind: "task",
    weight: "medium",
    area: "",
    evidence: "",
    column: "backlog",
    order: 1,
    brand: "",
    assignee: "",
    status: "",
    link: "",
    notes: "",
    ...overrides,
  };
}

function stubFetch() {
  // GET always "fails" (not ok) so Board.tsx's loadBoard() returns null and
  // the component just keeps rendering the `seed` prop passed in by the
  // test - the real save-to-server round trip is irrelevant to these UI
  // behaviours, which all live in local component state.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if ((init?.method || "GET").toUpperCase() === "PUT") {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
}

beforeEach(() => {
  stubFetch();
});

describe("Board - TicketCard is keyboard-operable", () => {
  it("opens the ticket dialog on Enter, not just a mouse click", async () => {
    const seed = [makeTicket()];
    const user = userEvent.setup();
    render(<Board boardId="engineering" title="Engineering" blurb="" seed={seed} />);

    // Anchored so it does not also match the card's "Move to" trigger,
    // whose own accessible name (`Move "Fix the thing" to another column`)
    // contains the same substring.
    const card = await screen.findByRole("button", { name: /^Fix the thing\./i });
    expect(card.getAttribute("tabindex")).toBe("0");

    card.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Task" })).toBeTruthy();
  });
});

describe("Board - moving a ticket between columns without drag-and-drop", () => {
  it('moves a ticket via the card\'s "Move to" menu (keyboard + click, no drag)', async () => {
    const seed = [makeTicket({ column: "backlog" })];
    const user = userEvent.setup();
    render(<Board boardId="engineering" title="Engineering" blurb="" seed={seed} />);

    // Before the fix there was no non-drag way to reach this at all.
    const moveTrigger = await screen.findByRole("button", {
      name: /move "fix the thing" to another column/i,
    });
    await user.click(moveTrigger);

    const moveToDoing = await screen.findByRole("menuitem", { name: "In progress" });
    await user.click(moveToDoing);

    // The card must now render under the "In progress" column, not
    // "Backlog" - proving the move actually happened, not just that a menu
    // opened.
    const doingColumn = screen.getByText("In progress").closest("section");
    expect(doingColumn).toBeTruthy();
    expect(within(doingColumn as HTMLElement).getByText("Fix the thing")).toBeTruthy();

    const backlogColumn = screen.getByText("Backlog").closest("section");
    expect(within(backlogColumn as HTMLElement).queryByText("Fix the thing")).toBeNull();
  });
});

describe("Board - ticket dialog is a real, focus-trapping dialog", () => {
  it('has role="dialog" and traps focus inside it on open, not a hand-rolled overlay div', async () => {
    const seed = [makeTicket()];
    const user = userEvent.setup();
    render(<Board boardId="engineering" title="Engineering" blurb="" seed={seed} />);

    await user.click(screen.getByText("Fix the thing"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();
    // Radix's FocusScope (trapped) auto-focuses something inside the
    // dialog on mount - the hand-rolled `<div className="fixed inset-0">`
    // it replaced never moved focus at all, so Tab could walk straight out
    // to the page behind it.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe("Board - deleting a ticket requires confirmation", () => {
  it("does not delete on the first click; only 'Delete permanently' inside the confirmation does", async () => {
    const seed = [makeTicket({ title: "Do not delete me by accident" })];
    const user = userEvent.setup();
    render(<Board boardId="engineering" title="Engineering" blurb="" seed={seed} />);

    await user.click(screen.getByText("Do not delete me by accident"));
    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    // The ticket must still exist - both in the (now-closed) edit dialog's
    // absence and back on the board - until the confirmation is accepted.
    const confirmDialog = await screen.findByRole("alertdialog");
    expect(within(confirmDialog).getByText(/cannot be undone|shared with everyone/i)).toBeTruthy();

    // Cancelling the confirmation must leave the ticket in place. The
    // underlying Task dialog is a modal too (still open), so `body` keeps
    // its scroll-lock the whole time - only the AlertDialog itself should
    // disappear.
    await user.click(within(confirmDialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("Do not delete me by accident")).toBeTruthy();

    // The ticket edit dialog itself is still open (only the confirmation
    // closed) - confirm this time via its own Delete button.
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^delete$/i }));
    const confirmDialog2 = await screen.findByRole("alertdialog");
    await user.click(within(confirmDialog2).getByRole("button", { name: /delete permanently/i }));

    expect(screen.queryByText("Do not delete me by accident")).toBeNull();
  });
});
