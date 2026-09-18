// "What I know" drawer (business-context.md; tooltip on the top bar's brain
// icon reads "What I know about this brand"). Read-only, in-context view -
// it links out to the full Business context page rather than editing in
// place, exactly like Trakkr's own drawer. Memory is the only tab built;
// Approvals and Connections render the same coming-soon shell the full page
// uses, so the tab strip's shape is honest about what's here today.
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Link2, Brain } from "lucide-react";
import { useAskDrawer } from "@/hooks/useAskDrawer";
import { ASK_MEMORY_TYPE_LABELS } from "@shared/ask/memory";
import { ComingSoonPanel } from "./context/ComingSoonPanel";
import { useState } from "react";
import { cn } from "@/lib/utils";

const DRAWER_TABS = ["memory", "approvals", "connections"] as const;
type DrawerTab = (typeof DRAWER_TABS)[number];

export function AskContextDrawer({
  open,
  onOpenChange,
  brandId,
  brandName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string | null;
  brandName: string;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DrawerTab>("memory");
  const { data, isLoading } = useAskDrawer(brandId, open);

  const goToContext = (contextTab: "brief" | "memory") => {
    onOpenChange(false);
    navigate({ to: "/agent/context", search: { tab: contextTab } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-110"
        aria-describedby={undefined}
      >
        <div className="border-b border-vc-default px-5 py-4">
          <h2 className="text-body font-semibold text-vc-primary">What I know</h2>
          <p className="text-caption text-vc-tertiary">About {brandName}</p>
        </div>

        <div className="flex gap-4 border-b border-vc-default px-5" role="tablist">
          {DRAWER_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-0.5 py-2.5 text-caption font-medium capitalize transition-colors",
                tab === t
                  ? "border-vc-accent text-vc-accent"
                  : "border-transparent text-vc-tertiary hover:text-vc-secondary",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === "memory" && (
            <div className="animate-fade-in motion-reduce:animate-none">
              <div className="mb-6">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-caption font-semibold text-vc-primary">
                    {brandName} context
                  </h3>
                  <button
                    type="button"
                    onClick={() => goToContext("brief")}
                    className="text-caption font-medium text-vc-accent hover:underline"
                  >
                    Open brief
                  </button>
                </div>
                <p className="text-caption text-vc-tertiary">
                  {data?.brief.status === "accepted"
                    ? "Brief saved. Open brief to review it."
                    : "A short brief helps the Agent choose work that fits. Start with your website, then add what matters most."}
                </p>
              </div>

              <div className="mb-6">
                <p className="mb-2 text-caption font-medium text-vc-primary">
                  Remembered
                  {!isLoading && data && data.memoryCount > 0 && (
                    <span className="text-vc-tertiary"> · {data.memoryCount}</span>
                  )}
                </p>
                {isLoading ? (
                  <div className="space-y-2" aria-busy="true">
                    <div className="h-10 animate-pulse rounded-md bg-vc-muted" />
                    <div className="h-10 animate-pulse rounded-md bg-vc-muted" />
                  </div>
                ) : !data || data.memories.length === 0 ? (
                  <p className="text-caption text-vc-tertiary">No shared memories saved yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.memories.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-md border border-vc-default bg-vc-surface p-2.5 text-caption"
                      >
                        <span className="mr-1.5 rounded-full bg-vc-muted px-1.5 py-0.5 text-data font-medium text-vc-tertiary">
                          {ASK_MEMORY_TYPE_LABELS[m.type]}
                        </span>
                        <span className="text-vc-secondary">{m.content}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => goToContext("memory")}
                  className="mt-3 text-caption font-medium text-vc-accent hover:underline"
                >
                  Manage memory and sources
                </button>
              </div>

              <div className="border-t border-vc-default pt-4">
                <p className="mb-1 text-caption font-medium text-vc-primary">
                  Your answer preferences
                </p>
                <p className="text-caption text-vc-tertiary">
                  Private to you. Shared work uses the business brief.
                </p>
              </div>
            </div>
          )}

          {tab === "approvals" && (
            <ComingSoonPanel
              icon={ShieldCheck}
              title="Approvals are on the way"
              description="What the Agent does without asking, by kind of work. Not built yet."
            />
          )}
          {tab === "connections" && (
            <ComingSoonPanel
              icon={Link2}
              title="Connections are on the way"
              description="Tools and accounts the Agent can reach. Not built yet."
            />
          )}
        </div>

        <div className="border-t border-vc-default px-5 py-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Back to conversation
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Referenced by AskWorkspace.tsx's tooltip text - kept here so the icon and
// its accessible name travel together. (S6a's observed tooltip.)
export const ASK_CONTEXT_DRAWER_TOOLTIP = "What I know about this brand";
export const AskContextDrawerIcon = Brain;
