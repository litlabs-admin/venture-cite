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
import { cn } from "@/lib/utils";
import type { Brand } from "@shared/schema";

// Brand picker. Wave 7: brand selection is required to generate, so the
// "No brand (generic content)" option is gone. Single-brand users see the
// brand pre-selected; this combobox is mostly invisible for them.

interface BrandComboboxProps {
  value: string;
  onChange: (next: string) => void;
  brands: Brand[];
  disabled?: boolean;
  placeholder?: string;
  testId?: string;
}

export default function BrandCombobox({
  value,
  onChange,
  brands,
  disabled = false,
  placeholder = "Select brand…",
  testId = "brand-combobox",
}: BrandComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = brands.find((b) => b.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled || brands.length === 0}
          data-testid={testId}
        >
          {selected ? `${selected.name} (${selected.companyName})` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
        <Command>
          <CommandInput placeholder="Type to filter…" />
          <CommandList>
            <CommandEmpty>No brands match.</CommandEmpty>
            <CommandGroup>
              {brands.map((b) => (
                <CommandItem
                  key={b.id}
                  value={`${b.name} ${b.companyName}`}
                  onSelect={() => {
                    onChange(b.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === b.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="font-medium">{b.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{b.companyName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
