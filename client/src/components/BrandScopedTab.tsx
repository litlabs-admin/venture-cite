import type { ComponentType } from "react";
import { Brain } from "lucide-react";
import { Card } from "@/components/ui/card";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";

// Hosts an intelligence child component (which needs a `selectedBrandId`
// prop) as a zero-prop tab body for the workflow-spine shells. Mirrors the
// brand gate the dissolved ai-intelligence page used, so behaviour is
// unchanged for the relocated tabs.
export function brandScoped(Child: ComponentType<{ selectedBrandId: string }>): ComponentType {
  return function BrandScoped() {
    const { selectedBrandId, brands } = useBrandSelection();
    return (
      <div className="space-y-4">
        {brands.length > 0 ? (
          <div className="flex justify-end">
            <BrandSelector />
          </div>
        ) : null}
        {!selectedBrandId ? (
          <Card className="p-12 text-center">
            <Brain className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-1 text-lg font-semibold">Select a brand to get started</h2>
            <p className="text-sm text-muted-foreground">Choose a brand above to view this data.</p>
          </Card>
        ) : (
          <Child selectedBrandId={selectedBrandId} />
        )}
      </div>
    );
  };
}
