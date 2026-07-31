import type { ComponentType } from "react";
import { Brain } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";

// Hosts an intelligence child component (which needs a `selectedBrandId`
// prop) as a zero-prop tab body for the workflow-spine shells. The
// AppShell context bar already owns the brand selector; rendering another
// one here was a duplicate - removed.
export function brandScoped(Child: ComponentType<{ selectedBrandId: string }>): ComponentType {
  return function BrandScoped() {
    const { selectedBrandId } = useBrandSelection();
    if (!selectedBrandId) {
      return (
        <div className="p-12 text-center">
          <Brain className="mx-auto mb-3 h-12 w-12 text-vc-hover" />
          <h2 className="mb-1 text-ui font-semibold text-vc-primary">
            Select a brand to get started
          </h2>
          <p className="text-caption text-vc-tertiary">
            Choose a brand from the selector above to view this data.
          </p>
        </div>
      );
    }
    return <Child selectedBrandId={selectedBrandId} />;
  };
}
