import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    // Title/robots moved to src/routes/_app/$.tsx's `head()` — metadata
    // belongs to the route, not this component.
    <div className="min-h-screen w-full flex items-center justify-center bg-muted">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="mt-6">
            <Link to="/">
              <Button variant="default">Go home</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
