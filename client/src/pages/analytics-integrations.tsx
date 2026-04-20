import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Search, BarChart3, Globe, ExternalLink, CheckCircle, AlertCircle, Settings, BookOpen } from "lucide-react";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import { SiGoogle } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";

export default function AnalyticsIntegrations() {
  const { toast } = useToast();
  const [ga4PropertyId, setGa4PropertyId] = useState(() => localStorage.getItem('venturecite-ga4-id') || '');
  const [gscSiteUrl, setGscSiteUrl] = useState(() => localStorage.getItem('venturecite-gsc-url') || '');
  const [ga4Saved, setGa4Saved] = useState(() => !!localStorage.getItem('venturecite-ga4-id'));
  const [gscSaved, setGscSaved] = useState(() => !!localStorage.getItem('venturecite-gsc-url'));

  const saveGA4 = () => {
    if (ga4PropertyId.trim()) {
      localStorage.setItem('venturecite-ga4-id', ga4PropertyId.trim());
      setGa4Saved(true);
      toast({ title: "GA4 Property Saved", description: "Your GA4 tracking ID has been saved. Add the tracking code to your website to start collecting data." });
    }
  };

  const saveGSC = () => {
    if (gscSiteUrl.trim()) {
      localStorage.setItem('venturecite-gsc-url', gscSiteUrl.trim());
      setGscSaved(true);
      toast({ title: "Search Console Saved", description: "Your site URL has been saved." });
    }
  };

  const clearGA4 = () => {
    localStorage.removeItem('venturecite-ga4-id');
    setGa4PropertyId('');
    setGa4Saved(false);
  };

  const clearGSC = () => {
    localStorage.removeItem('venturecite-gsc-url');
    setGscSiteUrl('');
    setGscSaved(false);
  };

  return (
    <div className="space-y-8">
      <Helmet><title>Analytics Integrations - VentureCite</title></Helmet>
      <PageHeader title="Analytics Integrations" description="Step-by-step setup guide to connect your Google Analytics and Search Console accounts" />

      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">This is a setup guide</span> — it walks you through configuring your own Google Analytics 4 and Search Console accounts to track visitors coming from AI engines. Save your property IDs here for quick reference. All analytics data lives in your Google accounts, not in VentureCite.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <Card className={ga4Saved ? "border-green-500/50" : ""} data-testid="card-ga4-integration">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <SiGoogle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Google Analytics 4</CardTitle>
                  <CardDescription>Track website traffic and AI referrals</CardDescription>
                </div>
              </div>
              {ga4Saved ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline">Not Configured</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="ga4-id" className="text-sm">GA4 Measurement ID</Label>
                <Input
                  id="ga4-id"
                  placeholder="G-XXXXXXXXXX"
                  value={ga4PropertyId}
                  onChange={(e) => setGa4PropertyId(e.target.value)}
                  className="mt-1"
                  data-testid="input-ga4-id"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Find this in GA4 → Admin → Data Streams → your stream
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveGA4} disabled={!ga4PropertyId.trim()} size="sm" data-testid="button-save-ga4">
                  <Settings className="w-4 h-4 mr-2" />
                  {ga4Saved ? 'Update' : 'Save'}
                </Button>
                {ga4Saved && (
                  <Button variant="outline" size="sm" onClick={clearGA4} data-testid="button-clear-ga4">
                    Remove
                  </Button>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" data-testid="link-ga4-dashboard">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open GA4
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={gscSaved ? "border-green-500/50" : ""} data-testid="card-gsc-integration">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <Search className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Google Search Console</CardTitle>
                  <CardDescription>Monitor search performance and rankings</CardDescription>
                </div>
              </div>
              {gscSaved ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" /> Configured
                </Badge>
              ) : (
                <Badge variant="outline">Not Configured</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="gsc-url" className="text-sm">Website URL</Label>
                <Input
                  id="gsc-url"
                  placeholder="https://yourdomain.com"
                  value={gscSiteUrl}
                  onChange={(e) => setGscSiteUrl(e.target.value)}
                  className="mt-1"
                  data-testid="input-gsc-url"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The property URL verified in Search Console
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveGSC} disabled={!gscSiteUrl.trim()} size="sm" data-testid="button-save-gsc">
                  <Settings className="w-4 h-4 mr-2" />
                  {gscSaved ? 'Update' : 'Save'}
                </Button>
                {gscSaved && (
                  <Button variant="outline" size="sm" onClick={clearGSC} data-testid="button-clear-gsc">
                    Remove
                  </Button>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" data-testid="link-gsc-dashboard">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open GSC
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8" data-testid="card-tracking-setup">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            AI Traffic Tracking Setup Guide
          </CardTitle>
          <CardDescription>
            Follow these steps to start tracking AI-driven traffic to your website
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600">1</div>
              <div>
                <h3 className="font-semibold mb-1">Set up Google Analytics 4</h3>
                <p className="text-sm text-muted-foreground mb-2">Create a GA4 property at analytics.google.com and add the tracking code to your website. This tracks all visitors including those coming from AI engine referrals.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://support.google.com/analytics/answer/9304153" target="_blank" rel="noopener noreferrer">
                    <BookOpen className="w-4 h-4 mr-2" />
                    GA4 Setup Guide
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600">2</div>
              <div>
                <h3 className="font-semibold mb-1">Track AI Engine Referrals</h3>
                <p className="text-sm text-muted-foreground mb-2">In GA4, create a custom channel group to identify traffic from AI engines. Add these referral sources:</p>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-md p-3 text-sm font-mono space-y-1">
                  <p>chat.openai.com (ChatGPT)</p>
                  <p>claude.ai (Claude)</p>
                  <p>perplexity.ai (Perplexity)</p>
                  <p>gemini.google.com (Gemini)</p>
                  <p>copilot.microsoft.com (Copilot)</p>
                  <p>grok.x.ai (Grok)</p>
                  <p>manus.im (Manus AI)</p>
                  <p>you.com (You.com)</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600">3</div>
              <div>
                <h3 className="font-semibold mb-1">Verify in Google Search Console</h3>
                <p className="text-sm text-muted-foreground mb-2">Verify your website in Search Console to monitor how Google indexes your content. This is essential for Google AI Overview visibility.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://support.google.com/webmasters/answer/9008080" target="_blank" rel="noopener noreferrer">
                    <BookOpen className="w-4 h-4 mr-2" />
                    GSC Verification Guide
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm font-bold text-blue-600">4</div>
              <div>
                <h3 className="font-semibold mb-1">Monitor AI Traffic Growth</h3>
                <p className="text-sm text-muted-foreground">Once configured, you can track AI-driven traffic growth in your GA4 dashboard. Use the VentureCite GEO Rankings feature to correlate citation improvements with traffic increases.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-ai-referral-sources">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Known AI Engine Referral Sources
          </CardTitle>
          <CardDescription>
            These are the referral domains to watch in your analytics for AI-driven traffic
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[
              { name: "ChatGPT", domain: "chat.openai.com", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
              { name: "Claude", domain: "claude.ai", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
              { name: "Perplexity", domain: "perplexity.ai", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
              { name: "Gemini", domain: "gemini.google.com", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
              { name: "Microsoft Copilot", domain: "copilot.microsoft.com", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400" },
              { name: "Grok", domain: "grok.x.ai", color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-muted-foreground" },
              { name: "Manus AI", domain: "manus.im", color: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400" },
              { name: "You.com", domain: "you.com", color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400" },
              { name: "Meta AI", domain: "meta.ai", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400" },
              { name: "DeepSeek", domain: "chat.deepseek.com", color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400" },
            ].map((engine) => (
              <div key={engine.name} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`referral-source-${engine.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <div>
                  <Badge className={engine.color}>{engine.name}</Badge>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{engine.domain}</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href={`https://${engine.domain}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
