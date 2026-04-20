import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper, Clock } from "lucide-react";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";

export default function PublicationIntelligence() {
  return (
    <div className="space-y-8">
      <Helmet><title>Publication Intelligence - VentureCite</title></Helmet>
      <PageHeader
        title="Publication Intelligence"
        description="Discover which outlets AI platforms cite most for your industry"
        actions={
          <Badge variant="outline" className="gap-1.5">
            <Clock className="w-3 h-3" />
            Coming Soon
          </Badge>
        }
      />

      <Card data-testid="card-coming-soon">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">We're Building Something Great</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Publication Intelligence will analyze which media outlets and publications get cited most by AI engines like ChatGPT, Claude, and Perplexity — so you know exactly where to pitch your brand for maximum AI visibility.
          </p>
          <div className="grid grid-cols-3 gap-8 max-w-md">
            <div>
              <p className="text-2xl font-semibold text-foreground">100+</p>
              <p className="text-xs text-muted-foreground mt-1">Publications</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">7</p>
              <p className="text-xs text-muted-foreground mt-1">AI Engines</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">20+</p>
              <p className="text-xs text-muted-foreground mt-1">Industries</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
