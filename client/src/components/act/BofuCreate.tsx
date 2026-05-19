// BOFU generator — relocated from the retired GEO Assets page into the
// unified /act Production create panel (2b). BOFU is the only Production
// type with a fully closed, code-visible enum (comparison | alternatives
// | guide), so inlining it fabricates nothing — unlike Article/Community
// whose author-chosen enums we won't guess. The generated piece lands in
// the same /api/bofu-content the Production list already reads.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, X as XIcon, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Competitor } from "@shared/schema";

interface CompetitorComboboxProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function CompetitorCombobox({ options, value, onChange, placeholder }: CompetitorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Case-insensitive presence check so "Salesforce" and "salesforce"
  // don't both end up in the payload (duplicated comparison rows).
  const indexOfCi = (list: string[], name: string) =>
    list.findIndex((v) => v.toLowerCase() === name.toLowerCase());

  const toggle = (name: string) => {
    const idx = indexOfCi(value, name);
    if (idx >= 0) onChange(value.filter((_, i) => i !== idx));
    else onChange([...value, name]);
  };

  const matches = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const isFreeform =
    search.trim().length > 0 &&
    !options.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="hover:text-destructive"
                aria-label={`Remove ${v}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            data-testid="button-bofu-competitors"
          >
            <span className="text-muted-foreground">
              {value.length === 0
                ? placeholder || "Select competitors..."
                : `${value.length} selected`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or type a name..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isFreeform) {
                  e.preventDefault();
                  const name = search.trim();
                  if (indexOfCi(value, name) < 0) onChange([...value, name]);
                  setSearch("");
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {isFreeform ? `Press Enter to add "${search.trim()}"` : "No competitors found."}
              </CommandEmpty>
              {matches.length > 0 && (
                <CommandGroup heading="Tracked competitors">
                  {matches.map((name) => {
                    const checked = indexOfCi(value, name) >= 0;
                    return (
                      <CommandItem key={name} value={name} onSelect={() => toggle(name)}>
                        <Check
                          className={
                            checked ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"
                          }
                        />
                        {name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function BofuCreatePanel({
  brandId,
  onCreated,
}: {
  brandId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [bofuType, setBofuType] = useState<string>("comparison");
  const [bofuCompetitors, setBofuCompetitors] = useState<string[]>([]);
  const [bofuKeyword, setBofuKeyword] = useState("");

  const { data: competitorsData } = useQuery<{ success: boolean; data: Competitor[] }>({
    queryKey: ["/api/competitors", brandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitors?brandId=${brandId}`);
      return res.json();
    },
    enabled: !!brandId,
  });
  const trackedCompetitors: Competitor[] = competitorsData?.data ?? [];

  const generateBofuMutation = useMutation({
    mutationFn: async (data: {
      contentType: string;
      comparedWith?: string[];
      keyword?: string;
    }) => {
      const response = await apiRequest("POST", "/api/bofu-content/generate", {
        brandId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "BOFU content saved",
        description: "It's in your Production list — open it to view, edit, or publish.",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/bofu-content",
      });
      onCreated();
    },
    onError: () => toast({ title: "Failed to generate content", variant: "destructive" }),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>New BOFU comparison</DialogTitle>
        <DialogDescription>
          Bottom-of-funnel content AI engines cite for purchase decisions — generated, then saved to
          your Production list.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Content type</label>
          <Select value={bofuType} onValueChange={setBofuType}>
            <SelectTrigger data-testid="select-bofu-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comparison">X vs Y Comparison</SelectItem>
              <SelectItem value="alternatives">Alternatives To</SelectItem>
              <SelectItem value="guide">Buying Guide</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(bofuType === "comparison" || bofuType === "alternatives") && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              {bofuType === "comparison" ? "Compare with" : "Alternatives to"}
            </label>
            <CompetitorCombobox
              options={trackedCompetitors.map((c) => c.name)}
              value={bofuCompetitors}
              onChange={setBofuCompetitors}
              placeholder="Pick competitors..."
            />
          </div>
        )}
        {bofuType === "guide" && (
          <div>
            <label className="mb-1 block text-sm font-medium">Target keyword</label>
            <Input
              placeholder="e.g., PR agency guide"
              value={bofuKeyword}
              onChange={(e) => setBofuKeyword(e.target.value)}
              data-testid="input-bofu-keyword"
            />
          </div>
        )}
        <Button
          className="w-full"
          disabled={generateBofuMutation.isPending}
          onClick={() =>
            generateBofuMutation.mutate({
              contentType: bofuType,
              comparedWith: bofuCompetitors.length > 0 ? bofuCompetitors : undefined,
              keyword: bofuKeyword || undefined,
            })
          }
          data-testid="prod-bofu-submit"
        >
          {generateBofuMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate
        </Button>
      </div>
    </>
  );
}
