import { useState } from "react";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import { PageHeaderHelp } from "@/components/PageHeaderHelp";
import { pageExplainers } from "@/lib/pageExplainers";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, AlertTriangle, Brain, Award, Users, History } from "lucide-react";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import ShareOfAnswerTab from "@/components/intelligence/ShareOfAnswerTab";
import CompetitorsTab from "@/components/intelligence/CompetitorsTab";
import CitationQualityTab from "@/components/intelligence/CitationQualityTab";
import HallucinationsTab from "@/components/intelligence/HallucinationsTab";
import TrendsTab from "@/components/intelligence/TrendsTab";

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
        actions={
          <div className="flex items-center gap-2">
            {brands.length > 0 ? <BrandSelector /> : null}
            <PageHeaderHelp tourId="ai-intelligence" pageLabel="AI Intelligence" />
          </div>
        }
        explainer={pageExplainers.aiIntelligence}
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
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger
              value="share-of-answer"
              data-testid="tab-share-of-answer"
              data-tour-id="aiIntel.tab.share"
            >
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
            <TabsTrigger
              value="hallucinations"
              data-testid="tab-hallucinations"
              data-tour-id="aiIntel.tab.hallucinations"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Hallucinations
            </TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">
              <History className="w-4 h-4 mr-2" />
              Trends
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
        </Tabs>
      )}
    </div>
  );
}
