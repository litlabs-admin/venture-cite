import { AlertCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

export default function NotFound() {
  return (
    // Title/robots moved to src/routes/_app/$.tsx's `head()` - metadata
    // belongs to the route, not this component.
    <PanelPage className="flex items-center justify-center p-4">
      <PanelRow cols={1} last className="w-full max-w-md mx-4">
        <Panel width="wide" border="last">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-page font-semibold text-vc-primary">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-caption text-vc-tertiary">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="mt-6">
            <Link to="/">
              <Button variant="default">Go home</Button>
            </Link>
          </div>
        </Panel>
      </PanelRow>
    </PanelPage>
  );
}
