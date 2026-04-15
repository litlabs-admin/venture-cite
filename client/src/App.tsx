import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import GuidedOnboarding from "@/components/GuidedOnboarding";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Content from "@/pages/content";
import Citations from "@/pages/citations";
import Articles from "@/pages/articles";
import GeoRankings from "@/pages/geo-rankings";
import Brands from "@/pages/brands";
import ArticleView from "@/pages/article-view";
import RevenueAnalytics from "@/pages/revenue-analytics";
import PublicationIntelligence from "@/pages/publication-intelligence";
import Competitors from "@/pages/competitors";
import CrawlerCheck from "@/pages/crawler-check";
import GeoOpportunities from "@/pages/geo-opportunities";
import GeoAnalytics from "@/pages/geo-analytics";
import GeoTools from "@/pages/geo-tools";
import AIIntelligence from "@/pages/ai-intelligence";
import AgentDashboard from "@/pages/agent-dashboard";
import Outreach from "@/pages/outreach";
import AiTraffic from "@/pages/ai-traffic";
import Pricing from "@/pages/pricing";
import AnalyticsIntegrations from "@/pages/analytics-integrations";
import GeoSignals from "@/pages/geo-signals";
import FaqManager from "@/pages/faq-manager";
import ClientReports from "@/pages/client-reports";
import BrandFactSheet from "@/pages/brand-fact-sheet";
import KeywordResearch from "@/pages/keyword-research";
import AIVisibility from "@/pages/ai-visibility";
import CommunityEngagement from "@/pages/community-engagement";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AppLayout from "@/components/AppLayout";
import ComingSoon from "@/components/ComingSoon";

function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  return isAuthenticated ? (
    <AppLayout>
      <Home />
    </AppLayout>
  ) : <Landing />;
}

function AuthenticatedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }
  
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard">{() => <AuthenticatedRoute component={Home} />}</Route>
      <Route path="/content">{() => <AuthenticatedRoute component={Content} />}</Route>
      <Route path="/citations">{() => <AuthenticatedRoute component={Citations} />}</Route>
      <Route path="/articles">{() => <AuthenticatedRoute component={Articles} />}</Route>
      <Route path="/article/:slug" component={ArticleView} />
      {/* Phase 1 core features */}
      <Route path="/brands">{() => <AuthenticatedRoute component={Brands} />}</Route>
      <Route path="/keyword-research">{() => <AuthenticatedRoute component={KeywordResearch} />}</Route>
      <Route path="/ai-visibility">{() => <AuthenticatedRoute component={AIVisibility} />}</Route>
      {/* Phase 2 — Upcoming */}
      <Route path="/geo-rankings">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="GEO Rankings" />} />}</Route>
      <Route path="/revenue-analytics">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Revenue Analytics" />} />}</Route>
      <Route path="/publications">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Publication Intelligence" />} />}</Route>
      <Route path="/competitors">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Competitors" />} />}</Route>
      <Route path="/crawler-check">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Crawler Check" />} />}</Route>
      <Route path="/opportunities">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="GEO Opportunities" />} />}</Route>
      <Route path="/geo-analytics">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="GEO Analytics" />} />}</Route>
      <Route path="/geo-tools">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="GEO Tools" />} />}</Route>
      <Route path="/ai-intelligence">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="AI Intelligence" />} />}</Route>
      <Route path="/agent">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Agent Dashboard" />} />}</Route>
      <Route path="/outreach">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Outreach" />} />}</Route>
      <Route path="/ai-traffic">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="AI Traffic" />} />}</Route>
      <Route path="/analytics-integrations">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Analytics Integrations" />} />}</Route>
      <Route path="/geo-signals">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="GEO Signals" />} />}</Route>
      <Route path="/faq-manager">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="FAQ Manager" />} />}</Route>
      <Route path="/client-reports">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Client Reports" />} />}</Route>
      <Route path="/brand-fact-sheet">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Brand Fact Sheet" />} />}</Route>
      <Route path="/community">{() => <AuthenticatedRoute component={() => <ComingSoon featureName="Community Engagement" />} />}</Route>
      <Route path="/pricing" component={Pricing} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <GuidedOnboarding />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
