// Your preferences tab (business-context.md). Two sections: the private,
// persistent tone/language/answer-length controls, and "Just for one
// conversation" - a per-thread override that starts a brand-new thread
// rather than mutating the current one, matching the screenshot's own
// "Start conversation" affordance.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Lock, Loader2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { useAskPreferences } from "@/hooks/useAskPreferences";
import { cn } from "@/lib/utils";
import {
  ASK_ANSWER_LENGTHS,
  ASK_ANSWER_LENGTH_LABELS,
  ASK_PREFERENCE_TONES,
  ASK_PREFERENCE_TONE_LABELS,
  ASK_PREFERENCE_LANGUAGES,
  type AskAnswerLength,
  type AskPreferenceTone,
} from "@shared/ask/preferences";

const NO_LANGUAGE_OVERRIDE = "__default__";

export function PreferencesTab({ brandId }: { brandId: string | null }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { preferences, isLoading, save } = useAskPreferences();

  const [tone, setTone] = useState<AskPreferenceTone | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [answerLength, setAnswerLength] = useState<AskAnswerLength | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [temporaryInstructions, setTemporaryInstructions] = useState("");
  const [task, setTask] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!preferences) return;
    setTone(preferences.tone);
    setLanguage(preferences.language);
    setAnswerLength(preferences.answerLength);
  }, [preferences]);

  const isDirty =
    !!preferences &&
    (tone !== preferences.tone ||
      language !== preferences.language ||
      answerLength !== preferences.answerLength);

  const handleSave = () => {
    save.mutate(
      { tone, language, answerLength },
      {
        onSuccess: () => toast({ description: "Preferences saved." }),
        onError: (err) =>
          toast({
            description: getApiErrorMessage(err, "Failed to save preferences"),
            variant: "destructive",
          }),
      },
    );
  };

  const handleStartConversation = async () => {
    if (!brandId || task.trim().length === 0) return;
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/ask/threads", {
        brandId,
        temporaryInstructions: temporaryInstructions.trim() || null,
      });
      const json = await res.json();
      const threadId = json.data.thread.id as string;
      navigate({ to: "/agent", search: { threadId, q: task.trim() } });
    } catch (err) {
      toast({
        description: getApiErrorMessage(err, "Failed to start conversation"),
        variant: "destructive",
      });
      setStarting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="mb-3 flex items-center gap-1.5 text-caption text-vc-tertiary">
          <Lock className="h-3 w-3" />
          Only you
        </div>
        <h2 className="text-body font-semibold text-vc-primary">Make the Agent feel like yours</h2>
        <p className="mt-1 text-caption text-vc-tertiary">
          How you like answers written. These preferences are private and never included in a shared
          handoff.
        </p>

        {isLoading ? (
          <div className="mt-5 h-32 animate-pulse rounded-md bg-vc-muted" />
        ) : (
          <div className="mt-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-caption text-vc-secondary">Tone</Label>
              <ToggleGroup
                type="single"
                value={tone ?? ""}
                onValueChange={(v) => setTone((v || null) as AskPreferenceTone | null)}
                className="justify-start"
              >
                {ASK_PREFERENCE_TONES.map((t) => (
                  <ToggleGroupItem key={t} value={t} className="text-caption">
                    {ASK_PREFERENCE_TONE_LABELS[t]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-1.5">
              <Label className="text-caption text-vc-secondary">Language</Label>
              <Select
                value={language ?? NO_LANGUAGE_OVERRIDE}
                onValueChange={(v) => setLanguage(v === NO_LANGUAGE_OVERRIDE ? null : v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LANGUAGE_OVERRIDE}>Same as I write in</SelectItem>
                  {ASK_PREFERENCE_LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-caption text-vc-secondary">Answer length</Label>
              <ToggleGroup
                type="single"
                value={answerLength ?? ""}
                onValueChange={(v) => setAnswerLength((v || null) as AskAnswerLength | null)}
                className="justify-start"
              >
                {ASK_ANSWER_LENGTHS.map((l) => (
                  <ToggleGroupItem key={l} value={l} className="text-caption">
                    {ASK_ANSWER_LENGTH_LABELS[l]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="pt-1">
              <Button size="sm" onClick={handleSave} disabled={!isDirty || save.isPending}>
                {save.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Save preferences
              </Button>
            </div>
          </div>
        )}
      </div>

      <Collapsible open={conversationOpen} onOpenChange={setConversationOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-caption font-medium text-vc-secondary hover:text-vc-primary">
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", conversationOpen && "rotate-180")}
          />
          Just for one conversation
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4 data-[state=closed]:animate-none data-[state=open]:animate-fade-in-up motion-reduce:data-[state=open]:animate-none">
          <p className="text-caption text-vc-tertiary">
            Need something different this time? Start a conversation with temporary instructions.
            They stay out of lasting memory.
          </p>
          <div className="space-y-1.5">
            <Label className="text-caption text-vc-secondary">Temporary instructions</Label>
            <Textarea
              value={temporaryInstructions}
              onChange={(e) => setTemporaryInstructions(e.target.value)}
              placeholder="For this task, explain everything for a non-technical audience."
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-caption text-vc-secondary">
              What would you like the Agent to do?
            </Label>
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Review our top priorities for this week."
              rows={3}
            />
          </div>
          <Button
            onClick={handleStartConversation}
            disabled={task.trim().length === 0 || !brandId || starting}
          >
            {starting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
            )}
            Start conversation
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
