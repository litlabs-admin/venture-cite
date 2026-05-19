import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Redirect, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/AppShell";
import { ScanCompletionListener } from "@/components/ScanCompletionListener";
import { TourOrchestrator } from "./tours/engine/TourOrchestrator";
import { RouteSpinner } from "@/components/foundations";

// Eager: first-paint + auth flow. Everything else is lazy so the initial
// bundle doesn't carry recharts / react-markdown / framer-motion etc.
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import VerifyEmail from "@/pages/verify-email";

// Pages still routed directly. The duplicate/secondary feature pages
// (citations, competitors, ai-intelligence, geo-*, faq-manager, community,
// brand-fact-sheet, ai-visibility, crawler-check) are no longer imported
// here — they are reached through the workflow spine and their old paths
// 301 into it via SpineRedirect below. Their components are still
// code-split, just lazy-imported by the spine shell pages instead.
const Content = lazy(() => import("@/pages/content"));
const Articles = lazy(() => import("@/pages/articles"));
const Brands = lazy(() => import("@/pages/brands"));
const KeywordResearch = lazy(() => import("@/pages/keyword-research"));
const Settings = lazy(() => import("@/pages/settings"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Welcome = lazy(() => import("@/pages/welcome"));
const Glossary = lazy(() => import("@/pages/glossary"));

// Workflow-spine shells.
const Monitor = lazy(() => import("@/pages/monitor"));
const Diagnose = lazy(() => import("@/pages/diagnose"));
const Act = lazy(() => import("@/pages/act"));
const Setup = lazy(() => import("@/pages/setup"));
const Report = lazy(() => import("@/pages/report"));

/**
 * 301s a retired feature path into its workflow-spine home, preserving every
 * existing query param (brandId, action, autoScrape, …) and adding `?tab=`.
 * The spine target is itself auth-gated, so unauthenticated hits still bounce
 * to /login. `replace` keeps the old URL out of history so Back doesn't loop.
 */
function SpineRedirect({ to, tab }: { to: string; tab: string }) {
  const search = useSearch();
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  return <Redirect to={`${to}?${params.toString()}`} replace />;
}

function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteSpinner />;
  }

  // Authenticated users land here post-signup (register.tsx → setLocation("/")).
  // Route through FirstRunGate so brand-less users get redirected to /welcome
  // before the dashboard renders.
  return isAuthenticated ? <FirstRunGate component={Home} /> : <Landing />;
}

function AuthenticatedRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteSpinner />;
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<RouteSpinner />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

function AuthenticatedBareRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteSpinner />;
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
    return <RouteSpinner />;
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
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<RouteSpinner />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
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
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/welcome">{() => <AuthenticatedBareRoute component={Welcome} />}</Route>
      <Route path="/dashboard">{() => <FirstRunGate component={Home} />}</Route>
      {/* Workflow-spine routes (Phase 0 scaffold). Old feature routes below
          remain live in parallel until later phases redirect them here. */}
      <Route path="/monitor">{() => <AuthenticatedRoute component={Monitor} />}</Route>
      <Route path="/diagnose">{() => <AuthenticatedRoute component={Diagnose} />}</Route>
      <Route path="/act">{() => <AuthenticatedRoute component={Act} />}</Route>
      <Route path="/setup">{() => <AuthenticatedRoute component={Setup} />}</Route>
      <Route path="/report">{() => <AuthenticatedRoute component={Report} />}</Route>
      <Route path="/content">{() => <AuthenticatedRoute component={Content} />}</Route>
      <Route path="/content/:articleId">{() => <AuthenticatedRoute component={Content} />}</Route>
      <Route path="/articles">{() => <AuthenticatedRoute component={Articles} />}</Route>
      <Route path="/brands">{() => <AuthenticatedRoute component={Brands} />}</Route>
      <Route path="/keyword-research">
        {() => <AuthenticatedRoute component={KeywordResearch} />}
      </Route>
      {/* Retired feature paths → workflow spine (query-preserving 301s).
          Old links, bookmarks, emails, and recommendation CTAs keep working. */}
      <Route path="/citations">{() => <SpineRedirect to="/monitor" tab="citations" />}</Route>
      <Route path="/geo-analytics">{() => <SpineRedirect to="/monitor" tab="overview" />}</Route>
      <Route path="/competitors">{() => <SpineRedirect to="/monitor" tab="competitors" />}</Route>
      <Route path="/ai-intelligence">
        {() => <SpineRedirect to="/monitor" tab="share-of-answer" />}
      </Route>
      <Route path="/geo-signals">{() => <SpineRedirect to="/diagnose" tab="signals" />}</Route>
      <Route path="/crawler-check">{() => <SpineRedirect to="/diagnose" tab="crawler" />}</Route>
      <Route path="/opportunities">
        {() => <SpineRedirect to="/diagnose" tab="hallucinations" />}
      </Route>
      <Route path="/geo-tools">{() => <SpineRedirect to="/act" tab="geo-assets" />}</Route>
      <Route path="/faq-manager">{() => <SpineRedirect to="/act" tab="faq" />}</Route>
      <Route path="/community">{() => <SpineRedirect to="/act" tab="community" />}</Route>
      <Route path="/brand-fact-sheet">{() => <SpineRedirect to="/setup" tab="fact-sheet" />}</Route>
      <Route path="/ai-visibility">{() => <SpineRedirect to="/setup" tab="visibility" />}</Route>
      <Route path="/settings">{() => <AuthenticatedRoute component={Settings} />}</Route>
      <Route path="/privacy">
        {() => (
          <Suspense fallback={<RouteSpinner />}>
            <Privacy />
          </Suspense>
        )}
      </Route>
      <Route path="/glossary">
        {() => (
          <Suspense fallback={<RouteSpinner />}>
            <Glossary />
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
            <ScanCompletionListener />
            <TourOrchestrator />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
