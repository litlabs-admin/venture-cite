import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

// Phase 2 feature pages
const Competitors = lazy(() => import("@/pages/competitors"));
const CrawlerCheck = lazy(() => import("@/pages/crawler-check"));
const GeoOpportunities = lazy(() => import("@/pages/geo-opportunities"));
const GeoAnalytics = lazy(() => import("@/pages/geo-analytics"));
const GeoTools = lazy(() => import("@/pages/geo-tools"));
const AiIntelligence = lazy(() => import("@/pages/ai-intelligence"));
const GeoSignals = lazy(() => import("@/pages/geo-signals"));
const FaqManager = lazy(() => import("@/pages/faq-manager"));
const ClientReports = lazy(() => import("@/pages/client-reports"));
const BrandFactSheet = lazy(() => import("@/pages/brand-fact-sheet"));
const CommunityEngagement = lazy(() => import("@/pages/community-engagement"));
const Settings = lazy(() => import("@/pages/settings"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Welcome = lazy(() => import("@/pages/welcome"));
const Landing2 = lazy(() => import("@/pages/landing2"));

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

  // Authenticated users land here post-signup (register.tsx → setLocation("/")).
  // Route through FirstRunGate so brand-less users get redirected to /welcome
  // before the dashboard renders.
  return isAuthenticated ? <FirstRunGate component={Home} /> : <Landing />;
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

function AuthenticatedBareRoute({ component: Component }: { component: ComponentType }) {
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
    <ErrorBoundary>
      <Suspense fallback={<RouteSpinner />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

function FirstRunGate({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  // The /api/brands response is { success: true, data: Brand[] }.
  // Unwrap it so the redirect check below sees the array, not the envelope.
  const brandsQuery = useQuery<{ success: boolean; data: unknown[] }>({
    queryKey: ["/api/brands"],
    enabled: isAuthenticated,
  });

  if (isLoading || (isAuthenticated && brandsQuery.isLoading)) {
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

  const brands = brandsQuery.data?.data;
  if (Array.isArray(brands) && brands.length === 0) {
    return <Redirect to="/welcome" />;
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
      <Route path="/welcome">{() => <AuthenticatedBareRoute component={Welcome} />}</Route>
      <Route path="/dashboard">{() => <FirstRunGate component={Home} />}</Route>
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
      <Route path="/keyword-research">
        {() => <AuthenticatedRoute component={KeywordResearch} />}
      </Route>
      <Route path="/ai-visibility">{() => <AuthenticatedRoute component={AIVisibility} />}</Route>
      {/* Phase 2 — Feature pages */}
      <Route path="/competitors">{() => <AuthenticatedRoute component={Competitors} />}</Route>
      <Route path="/crawler-check">{() => <AuthenticatedRoute component={CrawlerCheck} />}</Route>
      <Route path="/opportunities">
        {() => <AuthenticatedRoute component={GeoOpportunities} />}
      </Route>
      <Route path="/geo-analytics">{() => <AuthenticatedRoute component={GeoAnalytics} />}</Route>
      <Route path="/geo-tools">{() => <AuthenticatedRoute component={GeoTools} />}</Route>
      <Route path="/ai-intelligence">
        {() => <AuthenticatedRoute component={AiIntelligence} />}
      </Route>
      <Route path="/geo-signals">{() => <AuthenticatedRoute component={GeoSignals} />}</Route>
      <Route path="/faq-manager">{() => <AuthenticatedRoute component={FaqManager} />}</Route>
      <Route path="/client-reports">{() => <AuthenticatedRoute component={ClientReports} />}</Route>
      <Route path="/brand-fact-sheet">
        {() => <AuthenticatedRoute component={BrandFactSheet} />}
      </Route>
      <Route path="/community">
        {() => <AuthenticatedRoute component={CommunityEngagement} />}
      </Route>
      <Route path="/settings">{() => <AuthenticatedRoute component={Settings} />}</Route>
      <Route path="/privacy">
        {() => (
          <Suspense fallback={<RouteSpinner />}>
            <Privacy />
          </Suspense>
        )}
      </Route>
      <Route path="/landing2">
        {() => (
          <Suspense fallback={<RouteSpinner />}>
            <Landing2 />
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
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
