import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import {
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Share2,
  Target,
  Radar,
  CornerDownLeft,
} from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useAskThreads } from "@/hooks/useAskThreads";
import { usePrompts } from "@/hooks/usePrompts";
import { cn } from "@/lib/utils";
import {
  NAV,
  QUICK_ACTIONS,
  SETTINGS_ENTRIES,
  matchesQuery,
  containsAllWords,
  type Icon,
  type NavEntry,
  type QuickAction,
  type SettingsEntry,
} from "@/lib/askWindowSearch";
import { ASK_SUGGESTION_PALETTE, type AskSuggestionIcon } from "@shared/ask/suggestions";

// ─── The Ask window ──────────────────────────────────────────────────────────
// ⌘K's one merged window (Trakkr screenshots): a single input over five
// groups. Empty input shows only the four Ask suggestions - rendered from
// the shared shared/ask/suggestions.ts constant, not fetched, so they never
// have a blank/"Nothing matches" moment before the window's very first
// paint. Typed input shows Ask agent (always first) then Quick actions /
// Pages / Settings / Prompts, each hidden when nothing matches - the
// matching rule and the fixed lists themselves live in
// client/src/lib/askWindowSearch.ts. Picking the Ask row or a suggestion
// creates a thread and starts the run immediately - it never just prefills
// the composer (that was the old `?draft=` behaviour; see
// src/routes/-shared/searchSchemas.ts's `q` field for the replacement).
//
// Built directly on cmdk + Radix Dialog primitives, not client/src/
// components/ui/command.tsx's wrappers - that file's CommandItem/CommandList
// bake in their own selected-state and sizing classes, which would have to
// fight this window's green-tint selection and taller rows on every render.
// Cheaper to compose the primitives directly than to out-specify them.

// One list row. `accentDot` renders the Ask window's green "you typed this"
// dot instead of an icon; the ↵ glyph only shows on the highlighted row
// (cmdk sets data-selected on CommandPrimitive.Item, and `group` lets the
// child key off it).
function Row({
  value,
  icon: Icon,
  title,
  description,
  accentDot,
  capitalizeTitle,
  onSelect,
}: {
  value: string;
  icon?: Icon;
  title: string;
  description?: string;
  accentDot?: boolean;
  // Display only - `title` itself is untouched, and is still exactly what
  // gets sent as the question (sendAsk(s.text) below reads the ORIGINAL
  // string). shared/ask/suggestions.ts's sentences are written lowercase
  // (they read as a question, not a heading) - `capitalize` (CSS
  // text-transform) is cosmetic-only here, never applied to what the model
  // actually receives.
  capitalizeTitle?: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-caption text-vc-secondary outline-none data-[selected=true]:bg-positive-subtle"
    >
      {accentDot ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-positive" />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0 text-vc-tertiary" />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium text-vc-primary",
            capitalizeTitle && "capitalize",
          )}
        >
          {title}
        </span>
        {description && <span className="block truncate text-vc-tertiary">{description}</span>}
      </span>
      <CornerDownLeft className="hidden h-3 w-3 shrink-0 text-vc-tertiary group-data-[selected=true]:block" />
    </CommandPrimitive.Item>
  );
}

function Group({
  heading,
  accent,
  children,
}: {
  heading: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className={cn(
        "mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-data [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide",
        accent
          ? "[&_[cmdk-group-heading]]:text-positive"
          : "[&_[cmdk-group-heading]]:text-vc-tertiary",
      )}
    >
      {children}
    </CommandPrimitive.Group>
  );
}

const askIconByKey: Record<AskSuggestionIcon, Icon> = {
  "trending-up": TrendingUp,
  share: Share2,
  target: Target,
  radar: Radar,
};

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const [query, setQuery] = useState("");

  // Thread creation only - the list query itself belongs to AskThreadList /
  // AskWorkspace, both already mounted; this window never renders a list.
  const { createThread } = useAskThreads({ enabled: false, brandId: selectedBrandId || null });
  const promptsQuery = usePrompts(open ? selectedBrandId : null);

  function close() {
    onOpenChange(false);
    // Clear after the dialog's close transition so the list doesn't flicker
    // back to "all" while it fades out.
    setTimeout(() => setQuery(""), 150);
  }

  // Ask agent row + suggestions: create a thread, then hand the question to
  // AskWorkspace via the one-shot `q` param (askSearchSchema) so the run
  // starts the moment /agent mounts - never just a prefilled composer.
  async function sendAsk(text: string) {
    const q = text.trim();
    if (!q || !selectedBrandId) return;
    close();
    const thread = await createThread.mutateAsync();
    navigate({ to: "/agent", search: { threadId: thread.id, brandId: selectedBrandId, q } });
  }

  function goToPage(entry: NavEntry) {
    const search: Record<string, string> = {};
    if (entry.tab) search.tab = entry.tab;
    if (entry.brandScoped && selectedBrandId) search.brandId = selectedBrandId;
    navigate({ to: entry.to, search: Object.keys(search).length > 0 ? search : undefined });
    close();
  }

  function goToQuickAction(action: QuickAction) {
    const search: Record<string, string> = { tab: action.tab };
    if (action.ptab) search.ptab = action.ptab;
    if (selectedBrandId) search.brandId = selectedBrandId;
    navigate({ to: action.to, search });
    close();
  }

  function goToSettings(entry: SettingsEntry) {
    navigate({ to: "/settings", hash: entry.id });
    close();
  }

  function goToPrompt(promptId: string) {
    navigate({ to: "/prompts/$promptId", params: { promptId } });
    close();
  }

  const trimmed = query.trim();

  const matchedQuickActions = trimmed ? QUICK_ACTIONS.filter((a) => matchesQuery(trimmed, a)) : [];
  const matchedPages = trimmed ? NAV.filter((n) => matchesQuery(trimmed, n)) : [];
  const matchedSettings = trimmed ? SETTINGS_ENTRIES.filter((s) => matchesQuery(trimmed, s)) : [];
  const prompts = promptsQuery.data?.data ?? [];
  const matchedPrompts = trimmed
    ? prompts.filter((p) => containsAllWords(p.prompt, trimmed)).slice(0, 6)
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-[18%] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-vc-default bg-vc-surface shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogTitle className="sr-only">Ask</DialogTitle>
          <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-3 px-4 py-4">
              <CommandPrimitive.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={
                  selectedBrand ? `Ask anything about ${selectedBrand.name}…` : "Ask anything…"
                }
                className="flex-1 bg-transparent text-dialog text-vc-primary outline-none placeholder:text-vc-tertiary"
              />
              <kbd className="shrink-0 rounded border border-vc-default bg-vc-muted px-1.5 py-0.5 font-mono text-data text-vc-tertiary">
                esc
              </kbd>
            </div>

            <CommandPrimitive.List className="max-h-[420px] overflow-y-auto border-t border-vc-default px-2 py-2">
              <CommandPrimitive.Empty className="px-3 py-6 text-center text-caption text-vc-tertiary">
                Nothing matches “{trimmed}”.
              </CommandPrimitive.Empty>

              {trimmed === "" ? (
                selectedBrand && (
                  <Group heading={`For ${selectedBrand.name} · this week`}>
                    {ASK_SUGGESTION_PALETTE.map((s, i) => (
                      <Row
                        key={i}
                        value={`suggestion:${i}:${s.text}`}
                        icon={askIconByKey[s.icon] ?? Sparkles}
                        title={s.text}
                        capitalizeTitle
                        onSelect={() => sendAsk(s.text)}
                      />
                    ))}
                  </Group>
                )
              ) : (
                <>
                  <Group heading="Ask agent" accent>
                    <Row
                      value={`ask:${trimmed}`}
                      accentDot
                      title={trimmed}
                      onSelect={() => sendAsk(trimmed)}
                    />
                  </Group>

                  {matchedQuickActions.length > 0 && (
                    <Group heading="Quick actions">
                      {matchedQuickActions.map((a) => (
                        <Row
                          key={a.label}
                          value={`qa:${a.label}`}
                          icon={a.icon}
                          title={a.label}
                          description={a.description}
                          onSelect={() => goToQuickAction(a)}
                        />
                      ))}
                    </Group>
                  )}

                  {matchedPages.length > 0 && (
                    <Group heading="Pages">
                      {matchedPages.map((entry) => (
                        <Row
                          key={`${entry.to}${entry.tab ? `?tab=${entry.tab}` : ""}`}
                          value={`page:${entry.section} ${entry.label}`}
                          icon={entry.icon}
                          title={entry.label}
                          description={entry.description}
                          onSelect={() => goToPage(entry)}
                        />
                      ))}
                    </Group>
                  )}

                  {matchedSettings.length > 0 && (
                    <Group heading="Settings">
                      {matchedSettings.map((s) => (
                        <Row
                          key={s.id}
                          value={`settings:${s.id}`}
                          icon={Settings}
                          title={s.label}
                          description={s.description}
                          onSelect={() => goToSettings(s)}
                        />
                      ))}
                    </Group>
                  )}

                  {matchedPrompts.length > 0 && (
                    <Group heading="Prompts">
                      {matchedPrompts.map((p) => (
                        <Row
                          key={p.id}
                          value={`prompt:${p.id}`}
                          icon={Search}
                          title={p.prompt}
                          description="Active prompt"
                          onSelect={() => goToPrompt(p.id)}
                        />
                      ))}
                    </Group>
                  )}
                </>
              )}
            </CommandPrimitive.List>

            <div className="flex items-center justify-between border-t border-vc-default px-4 py-2 text-data text-vc-tertiary">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" /> open
                </span>
                <span>↑ ↓ navigate</span>
                <span>esc close</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate({ to: "/agent" });
                  close();
                }}
                className="text-vc-secondary hover:text-vc-primary"
              >
                Open workspace ↗
              </button>
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
