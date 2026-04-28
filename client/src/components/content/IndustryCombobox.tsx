import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { INDUSTRIES, INDUSTRY_GROUPS } from "@shared/industries";
import { cn } from "@/lib/utils";

// Type-to-filter combobox over the 50+ industries. Replaces the legacy
// Radix Select which forced users to scroll. Grouped by super-category.

interface IndustryComboboxProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
}

export default function IndustryCombobox({
  value,
  onChange,
  disabled = false,
  placeholder = "Select industry…",
  testId = "industry-combobox",
}: IndustryComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
          data-testid={testId}
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
        <Command>
          <CommandInput placeholder="Type to filter…" />
          <CommandList>
            <CommandEmpty>No matching industry.</CommandEmpty>
            {INDUSTRY_GROUPS.map((group) => (
              <CommandGroup key={group} heading={group}>
                {INDUSTRIES.filter((i) => i.group === group).map((ind) => (
                  <CommandItem
                    key={ind.value}
                    value={ind.value}
                    onSelect={() => {
                      onChange(ind.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === ind.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {ind.value}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
