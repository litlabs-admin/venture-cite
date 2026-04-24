import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrandSelection } from "@/hooks/use-brand-selection";

interface BrandSelectorProps {
  /** Custom width class. Defaults to a compact 200px to fit in PageHeader actions. */
  className?: string;
  placeholder?: string;
  /** When true, shows the industry alongside the name (used on forms where more context helps). */
  showIndustry?: boolean;
  /** Override the default hook-driven selection (rare — use only for forms). */
  value?: string;
  onValueChange?: (id: string) => void;
}

/**
 * The canonical brand picker. Use this in every feature page's PageHeader
 * actions so users see the same control in the same spot everywhere.
 *
 * By default it reads/writes from `useBrandSelection()`, which syncs the
 * selection to `?brandId=` in the URL (bookmarkable + shareable) and to
 * localStorage (survives navigation between pages). Pages that need form-local
 * brand state can override via `value` / `onValueChange`.
 */
export default function BrandSelector({
  className = "w-[200px]",
  placeholder = "Select brand",
  showIndustry = false,
  value,
  onValueChange,
}: BrandSelectorProps) {
  const { selectedBrandId, setSelectedBrandId, brands } = useBrandSelection();

  const activeValue = value !== undefined ? value : selectedBrandId;
  const handleChange = onValueChange ?? setSelectedBrandId;

  if (brands.length === 0) return null;

  return (
    <Select value={activeValue || undefined} onValueChange={handleChange}>
      <SelectTrigger className={className} data-testid="select-brand">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {brands.map((brand) => (
          <SelectItem key={brand.id} value={brand.id} data-testid={`select-brand-${brand.id}`}>
            {showIndustry
              ? `${brand.name}${brand.industry ? ` — ${brand.industry}` : ""}`
              : brand.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
