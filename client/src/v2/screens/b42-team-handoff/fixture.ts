import type { Board42Data } from "./Screen";

// Verbatim values from the approved render (M/17-team-and-handoff.png,
// fragment-45-team-handoff.html) where the shape allows it. The fragment
// shows five members; the live adapter (data.ts) never can, because this app
// has no multi-user membership table - a brand's only real member is its
// owner. This fixture keeps the Owner row (Jordan Diaz) for visual parity
// and is used only by the preview harness and component tests, never by the
// live page.
export const board42Fixture: Board42Data = {
  brandId: "470b15fe-606b-4d96-ab62-69a01e08b237",
  mode: "guided",
  brandName: "VenturePR",
  member: {
    id: "user-jordan",
    name: "Jordan Diaz",
    email: "jordan@venturepr.com",
    assignedBrandCount: 3,
    activeTaskCount: 8,
    waitingConfirmationCount: 2,
    lastActivityAt: "2026-09-12T10:24:00.000Z",
  },
  seatUsage: { used: 4, limit: 10 },
  invitations: [
    {
      id: "invite-chris",
      email: "chris@venturepr.com",
      role: "editor",
      status: "pending",
      createdAt: "2026-09-12T00:00:00.000Z",
    },
  ],
  auditEvents: [
    {
      id: "audit-1",
      summary: 'Jordan Diaz reassigned task "Update pricing page" to Maya Kim',
      occurredAt: "2026-09-12T10:18:00.000Z",
    },
    {
      id: "audit-2",
      summary: 'Emma Cox added evidence to "Clarify services page"',
      occurredAt: "2026-09-12T09:52:00.000Z",
    },
    {
      id: "audit-3",
      summary: "Alex Singh joined the team",
      occurredAt: "2026-09-11T15:27:00.000Z",
    },
  ],
  tasks: [{ id: "task-services-page", title: "Clarify services page" }],
};
