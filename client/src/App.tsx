import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import GuidedOnboarding from "@/components/GuidedOnboarding";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/AppLayout";

// Eager: first-paint + auth flow. Everything else is lazy so the initial
// bundle doesn't carry recharts / react-markdown / framer-motion etc.
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";

const Content = lazy(() => import("@/pages/content"));
const Citations = lazy(() => import("@/pages/citations"));
const Articles = lazy(() => import("@/pages/articles"));
const ArticleView = lazy(() => import("@/pages/article-view"));
const Brands = lazy(() => import("@/pages/brands"));
const KeywordResearch = lazy(() => import("@/pages/keyword-research"));
const AIVisibility = lazy(() => import("@/pages/ai-visibility"));
const Pricing = lazy(() => import("@/pages/pricing"));

// Phase 2 feature pages
const GeoRankings = lazy(() => import("@/pages/geo-rankings"));
const RevenueAnalytics = lazy(() => import("@/pages/revenue-analytics"));
const PublicationIntelligence = lazy(() => import("@/pages/publication-intelligence"));
const Competitors = lazy(() => import("@/pages/competitors"));
const CrawlerCheck = lazy(() => import("@/pages/crawler-check"));
const GeoOpportunities = lazy(() => import("@/pages/geo-opportunities"));
const GeoAnalytics = lazy(() => import("@/pages/geo-analytics"));
const GeoTools = lazy(() => import("@/pages/geo-tools"));
const AiIntelligence = lazy(() => import("@/pages/ai-intelligence"));
const AgentDashboard = lazy(() => import("@/pages/agent-dashboard"));
const Outreach = lazy(() => import("@/pages/outreach"));
const AiTraffic = lazy(() => import("@/pages/ai-traffic"));
const AnalyticsIntegrations = lazy(() => import("@/pages/analytics-integrations"));
const GeoSignals = lazy(() => import("@/pages/geo-signals"));
const FaqManager = lazy(() => import("@/pages/faq-manager"));
const ClientReports = lazy(() => import("@/pages/client-reports"));
const BrandFactSheet = lazy(() => import("@/pages/brand-fact-sheet"));
const CommunityEngagement = lazy(() => import("@/pages/community-engagement"));

function RouteSpinner() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-6 h-6 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
      <ErrorBoundary>
        <Home />
      </ErrorBoundary>
    </AppLayout>
  ) : <Landing />;
}

function AuthenticatedRoute({ component: Component }: { component: ComponentType }) {
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
      <ErrorBoundary>
        <Suspense fallback={<RouteSpinner />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
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
      <Route path="/article/:slug">
        {() => (
          <Suspense fallback={<RouteSpinner />}>
            <ArticleView />
          </Suspense>
        )}
      </Route>
      {/* Phase 1 core features */}
      <Route path="/brands">{() => <AuthenticatedRoute component={Brands} />}</Route>
      <Route path="/keyword-research">{() => <AuthenticatedRoute component={KeywordResearch} />}</Route>
      <Route path="/ai-visibility">{() => <AuthenticatedRoute component={AIVisibility} />}</Route>
      {/* Phase 2 — Feature pages */}
      <Route path="/geo-rankings">{() => <AuthenticatedRoute component={GeoRankings} />}</Route>
      <Route path="/revenue-analytics">{() => <AuthenticatedRoute component={RevenueAnalytics} />}</Route>
      <Route path="/publications">{() => <AuthenticatedRoute component={PublicationIntelligence} />}</Route>
      <Route path="/competitors">{() => <AuthenticatedRoute component={Competitors} />}</Route>
      <Route path="/crawler-check">{() => <AuthenticatedRoute component={CrawlerCheck} />}</Route>
      <Route path="/opportunities">{() => <AuthenticatedRoute component={GeoOpportunities} />}</Route>
      <Route path="/geo-analytics">{() => <AuthenticatedRoute component={GeoAnalytics} />}</Route>
      <Route path="/geo-tools">{() => <AuthenticatedRoute component={GeoTools} />}</Route>
      <Route path="/ai-intelligence">{() => <AuthenticatedRoute component={AiIntelligence} />}</Route>
      <Route path="/agent">{() => <AuthenticatedRoute component={AgentDashboard} />}</Route>
      <Route path="/outreach">{() => <AuthenticatedRoute component={Outreach} />}</Route>
      <Route path="/ai-traffic">{() => <AuthenticatedRoute component={AiTraffic} />}</Route>
      <Route path="/analytics-integrations">{() => <AuthenticatedRoute component={AnalyticsIntegrations} />}</Route>
      <Route path="/geo-signals">{() => <AuthenticatedRoute component={GeoSignals} />}</Route>
      <Route path="/faq-manager">{() => <AuthenticatedRoute component={FaqManager} />}</Route>
      <Route path="/client-reports">{() => <AuthenticatedRoute component={ClientReports} />}</Route>
      <Route path="/brand-fact-sheet">{() => <AuthenticatedRoute component={BrandFactSheet} />}</Route>
      <Route path="/community">{() => <AuthenticatedRoute component={CommunityEngagement} />}</Route>
      <Route path="/pricing">
        {() => (
          <Suspense fallback={<RouteSpinner />}>
            <Pricing />
          </Suspense>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <GuidedOnboarding />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
