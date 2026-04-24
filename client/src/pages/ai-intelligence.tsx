import { useState } from "react";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, AlertTriangle, Brain, MessageSquare, Award, Users, History } from "lucide-react";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import ShareOfAnswerTab from "@/components/intelligence/ShareOfAnswerTab";
import CompetitorsTab from "@/components/intelligence/CompetitorsTab";
import CitationQualityTab from "@/components/intelligence/CitationQualityTab";
import HallucinationsTab from "@/components/intelligence/HallucinationsTab";
import TrendsTab from "@/components/intelligence/TrendsTab";
import AlertsTab from "@/components/intelligence/AlertsTab";

export default function AIIntelligence() {
  const { selectedBrandId, brands } = useBrandSelection();
  const [activeTab, setActiveTab] = useState("share-of-answer");

  return (
    <div className="space-y-8">
      <Helmet>
        <title>AI Intelligence - VentureCite</title>
      </Helmet>
      <PageHeader
        title="AI Intelligence"
        description="Share-of-Answer, Citation Quality, and Hallucination Detection"
        actions={brands.length > 0 ? <BrandSelector /> : null}
      />

      {!selectedBrandId ? (
        <Card className="p-12 text-center">
          <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Select a Brand to Get Started</h2>
          <p className="text-muted-foreground">
            Choose a brand above to view AI intelligence metrics and insights
          </p>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="share-of-answer" data-testid="tab-share-of-answer">
              <Target className="w-4 h-4 mr-2" />
              Share-of-Answer
            </TabsTrigger>
            <TabsTrigger value="competitors" data-testid="tab-competitors">
              <Users className="w-4 h-4 mr-2" />
              Competitors
            </TabsTrigger>
            <TabsTrigger value="citation-quality" data-testid="tab-citation-quality">
              <Award className="w-4 h-4 mr-2" />
              Citation Quality
            </TabsTrigger>
            <TabsTrigger value="hallucinations" data-testid="tab-hallucinations">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Hallucinations
            </TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">
              <History className="w-4 h-4 mr-2" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="alerts" data-testid="tab-alerts">
              <MessageSquare className="w-4 h-4 mr-2" />
              Alerts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="share-of-answer">
            <ShareOfAnswerTab selectedBrandId={selectedBrandId} />
          </TabsContent>

          <TabsContent value="competitors">
            <CompetitorsTab selectedBrandId={selectedBrandId} />
          </TabsContent>

          <TabsContent value="citation-quality">
            <CitationQualityTab selectedBrandId={selectedBrandId} />
          </TabsContent>

          <TabsContent value="hallucinations">
            <HallucinationsTab selectedBrandId={selectedBrandId} />
          </TabsContent>

          <TabsContent value="trends">
            <TrendsTab selectedBrandId={selectedBrandId} />
          </TabsContent>

          <TabsContent value="alerts">
            <AlertsTab selectedBrandId={selectedBrandId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
