import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper, Clock, Sparkles } from "lucide-react";
import { Helmet } from "react-helmet";

export default function PublicationIntelligence() {
  return (
    <>
      <Helmet>
        <title>Publication Intelligence - VentureCite</title>
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
        <div className="container mx-auto p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-bold mb-2" data-testid="title-publications">Publication Intelligence</h1>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 mb-1" data-testid="badge-coming-soon">
                  <Clock className="w-3 h-3 mr-1" />
                  Coming Soon
                </Badge>
              </div>
              <p className="text-muted-foreground">Discover which outlets AI platforms cite most for your industry</p>
            </div>
          </div>

          <Card className="max-w-2xl mx-auto mt-12" data-testid="card-coming-soon">
            <CardContent className="py-16 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                <Newspaper className="w-10 h-10 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold mb-3">We're Building Something Great</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Publication Intelligence will analyze which media outlets and publications get cited most by AI engines like ChatGPT, Claude, and Perplexity — so you know exactly where to pitch your brand for maximum AI visibility.
              </p>
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">100+</p>
                  <p className="text-xs text-muted-foreground">Publications Tracked</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">7</p>
                  <p className="text-xs text-muted-foreground">AI Engines</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">20+</p>
                  <p className="text-xs text-muted-foreground">Industries</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>This feature is currently in development and will be available soon</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
