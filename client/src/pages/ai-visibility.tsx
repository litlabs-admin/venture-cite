import { useState, useEffect } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/PageHeader";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  ExternalLink,
  Lightbulb,
  Target,
  FileText,
  Globe,
  Building2,
  BookOpen,
  MessageSquare,
  Search,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Zap
} from "lucide-react";
import { SiOpenai, SiGoogle } from "react-icons/si";
import type { Brand } from "@shared/schema";

interface EngineStep {
  id: string;
  title: string;
  description: string;
  howTo: string;
  priority: "high" | "medium" | "low";
  estimatedImpact: string;
  quickAction?: {
    label: string;
    link: string;
  };
}

interface AIEngine {
  id: string;
  name: string;
  icon: JSX.Element;
  color: string;
  bgColor: string;
  description: string;
  keyFactors: string[];
  steps: EngineStep[];
}

const aiEngines: AIEngine[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    icon: <SiOpenai className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "OpenAI's ChatGPT prioritizes authoritative sources, Wikipedia, and well-structured content with clear facts.",
    keyFactors: ["Wikipedia presence", "Authoritative backlinks", "Clear factual statements", "Structured data"],
    steps: [
      {
        id: "chatgpt-reg-1",
        title: "Submit your site to Bing Webmaster Tools",
        description: "ChatGPT's search mode uses Bing's index. Submitting your site and sitemap to Bing Webmaster Tools ensures ChatGPT can find and cite your content in real-time searches.",
        howTo: "Go to bing.com/webmasters, sign in with a Microsoft account, add your site URL, verify ownership via DNS/meta tag, then submit your sitemap.xml. Monitor the crawl status regularly.",
        priority: "high",
        estimatedImpact: "Critical - ChatGPT search uses Bing's index",
        quickAction: { label: "Visit Bing Webmaster Tools", link: "https://www.bing.com/webmasters" }
      },
      {
        id: "chatgpt-reg-2",
        title: "Register on ChatGPT Merchant Program (for e-commerce)",
        description: "If you sell products, register on ChatGPT's Instant Checkout program. This lets your products appear directly in ChatGPT's shopping recommendations with buy buttons.",
        howTo: "Visit chatgpt.com/merchants and apply with your business details. You'll need Stripe integration. Products get featured in ChatGPT's product search mode. Free discovery; small fee only on purchases.",
        priority: "high",
        estimatedImpact: "Very High for e-commerce - Direct product recommendations",
        quickAction: { label: "Register as Merchant", link: "https://chatgpt.com/merchants/" }
      },
      {
        id: "chatgpt-reg-3",
        title: "Allow ChatGPT's crawler in your robots.txt",
        description: "OpenAI uses several crawlers to index your site. You must explicitly allow them in your robots.txt file for ChatGPT to cite your content.",
        howTo: "Add the following to your robots.txt:\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nThen submit your sitemap URL.",
        priority: "high",
        estimatedImpact: "Critical - Required for ChatGPT to access your content",
        quickAction: { label: "Robots.txt Generator", link: "/crawler-check" }
      },
      {
        id: "chatgpt-1",
        title: "Create a Wikipedia page or get mentioned on Wikipedia",
        description: "Wikipedia is one of ChatGPT's primary knowledge sources. Having a Wikipedia page or being cited on relevant Wikipedia articles significantly increases citation likelihood.",
        howTo: "If your brand qualifies for notability, create a Wikipedia page following their guidelines. Otherwise, contribute verified information to industry-related Wikipedia articles that naturally mention your brand.",
        priority: "high",
        estimatedImpact: "Very High - Wikipedia is heavily weighted in ChatGPT's training data",
        quickAction: { label: "Wikipedia Monitor", link: "/geo-tools" }
      },
      {
        id: "chatgpt-2",
        title: "Build a comprehensive Brand Fact Sheet",
        description: "ChatGPT synthesizes information from multiple sources. Having consistent, accurate facts across the web helps it cite you correctly.",
        howTo: "Create a detailed Brand Fact Sheet with your key facts, founding story, products, and USPs. Share this information consistently across all platforms.",
        priority: "high",
        estimatedImpact: "High - Reduces hallucinations and improves citation accuracy",
        quickAction: { label: "Create Fact Sheet", link: "/brand-fact-sheet" }
      },
      {
        id: "chatgpt-3",
        title: "Publish long-form authoritative content",
        description: "ChatGPT favors comprehensive, well-researched content that demonstrates expertise. Aim for 1,500+ word articles with citations.",
        howTo: "Create in-depth guides, whitepapers, and research pieces. Include statistics, expert quotes, and cite reputable sources.",
        priority: "high",
        estimatedImpact: "High - Establishes topical authority",
        quickAction: { label: "Generate Content", link: "/content" }
      },
      {
        id: "chatgpt-4",
        title: "Get cited by authoritative publications",
        description: "Backlinks from high-authority domains signal trustworthiness to ChatGPT's training data.",
        howTo: "Pursue guest posting, expert commentary, and press coverage on industry publications with high domain authority.",
        priority: "medium",
        estimatedImpact: "Medium-High - Authority signals compound over time",
        quickAction: { label: "Find Publications", link: "/publications" }
      },
      {
        id: "chatgpt-5",
        title: "Add structured data (Schema.org) to your website",
        description: "Structured data helps AI models understand your content's context and relationships.",
        howTo: "Implement Organization, Product, Article, and FAQ schema on your website. Use Google's Structured Data Testing Tool to validate.",
        priority: "medium",
        estimatedImpact: "Medium - Improves content understanding"
      },
      {
        id: "chatgpt-6",
        title: "Maintain consistent NAP across the web",
        description: "Name, Address, Phone consistency helps AI correlate information about your brand.",
        howTo: "Audit all your online listings and ensure your business information is identical everywhere.",
        priority: "low",
        estimatedImpact: "Low-Medium - Supports entity recognition"
      }
    ]
  },
  {
    id: "claude",
    name: "Claude",
    icon: <Sparkles className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "Anthropic's Claude values nuanced, well-reasoned content with clear sourcing and ethical considerations.",
    keyFactors: ["Nuanced explanations", "Ethical positioning", "Clear sourcing", "Quality over quantity"],
    steps: [
      {
        id: "claude-reg-1",
        title: "Allow ClaudeBot and Anthropic crawlers in your robots.txt",
        description: "Anthropic uses multiple crawlers: ClaudeBot (training), Claude-SearchBot (search indexing), and Claude-User (user-triggered fetching). Allowing these ensures Claude can discover and cite your content.",
        howTo: "Add to your robots.txt:\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: anthropic-ai\nAllow: /\n\nUser-agent: Claude-Web\nAllow: /\n\nUser-agent: Claude-SearchBot\nAllow: /\n\nContact claudebot@anthropic.com for crawler issues.",
        priority: "high",
        estimatedImpact: "Critical - Required for Claude to index your content",
        quickAction: { label: "Robots.txt Generator", link: "/crawler-check" }
      },
      {
        id: "claude-reg-2",
        title: "Structure content for Claude's extended context window",
        description: "Claude processes very long documents (200K+ tokens). Creating comprehensive, well-organized long-form content with clear section headings gives Claude more to work with and cite.",
        howTo: "Create detailed resource pages, comprehensive guides, and thorough documentation. Use clear H2/H3 headings, table of contents, and logical structure. Claude excels with in-depth content over surface-level pieces.",
        priority: "high",
        estimatedImpact: "High - Leverages Claude's unique long-context capability"
      },
      {
        id: "claude-1",
        title: "Create balanced, nuanced content",
        description: "Claude appreciates content that acknowledges complexity and presents multiple perspectives fairly.",
        howTo: "When creating content, address counterarguments, acknowledge limitations, and present balanced viewpoints. Avoid absolutist language.",
        priority: "high",
        estimatedImpact: "High - Aligns with Claude's reasoning approach",
        quickAction: { label: "Generate Content", link: "/content" }
      },
      {
        id: "claude-2",
        title: "Clearly cite sources in all content",
        description: "Claude values verifiable information with clear attribution to original sources.",
        howTo: "Include inline citations, reference lists, and links to primary sources in your content. Use academic citation formats where appropriate.",
        priority: "high",
        estimatedImpact: "High - Improves trustworthiness signals"
      },
      {
        id: "claude-3",
        title: "Publish original research and data",
        description: "Original research and proprietary data give Claude unique information to cite.",
        howTo: "Conduct surveys, analyze industry data, or compile unique datasets. Publish findings in detailed reports.",
        priority: "high",
        estimatedImpact: "Very High - Creates unique citeable assets"
      },
      {
        id: "claude-4",
        title: "Demonstrate ethical business practices",
        description: "Claude's training emphasizes ethical considerations. Highlighting responsible practices can improve visibility.",
        howTo: "Publish sustainability reports, ethical guidelines, and social responsibility initiatives. Be transparent about business practices.",
        priority: "medium",
        estimatedImpact: "Medium - Aligns with Claude's values"
      },
      {
        id: "claude-5",
        title: "Create educational content that teaches",
        description: "Claude excels at explanation and education. Content that teaches concepts well tends to get cited.",
        howTo: "Create how-to guides, explainers, and tutorials that break down complex topics. Use clear examples and analogies.",
        priority: "medium",
        estimatedImpact: "Medium-High - Educational content is frequently referenced"
      }
    ]
  },
  {
    id: "perplexity",
    name: "Perplexity",
    icon: <Search className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "Perplexity performs real-time web searches, prioritizing fresh, authoritative content with clear structure.",
    keyFactors: ["Fresh content", "Direct answers", "Clear headings", "Real-time indexing"],
    steps: [
      {
        id: "perplexity-reg-1",
        title: "Allow PerplexityBot in your robots.txt",
        description: "Perplexity searches the web in real-time. You must allow its crawler to access your site for any chance of being cited in Perplexity answers.",
        howTo: "Add to your robots.txt:\n\nUser-agent: PerplexityBot\nAllow: /\n\nAlso ensure your site loads fast and has a valid sitemap.xml. Perplexity prioritizes well-structured, fast-loading sites.",
        priority: "high",
        estimatedImpact: "Critical - Required for Perplexity citations",
        quickAction: { label: "Robots.txt Generator", link: "/crawler-check" }
      },
      {
        id: "perplexity-reg-2",
        title: "Apply to Perplexity Publisher Program",
        description: "Perplexity's Publisher Program offers revenue sharing (80/20 split), free API access, and enhanced analytics for how your content gets cited.",
        howTo: "Email publishers@perplexity.ai with your company overview, content specialty, traffic metrics, and why you'd be a good fit. Current partners include TIME, Fortune, and other major publishers. Even smaller publishers can apply.",
        priority: "high",
        estimatedImpact: "Very High - Revenue sharing + enhanced visibility",
        quickAction: { label: "Email Perplexity", link: "mailto:publishers@perplexity.ai" }
      },
      {
        id: "perplexity-1",
        title: "Ensure your site is crawlable by AI bots",
        description: "Perplexity needs to access your content in real-time. Blocked crawlers mean no citations.",
        howTo: "Check your robots.txt allows Perplexity's crawler. Add sitemap.xml and ensure pages load quickly.",
        priority: "high",
        estimatedImpact: "Critical - Required for any citations",
        quickAction: { label: "Check Crawler Access", link: "/crawler-check" }
      },
      {
        id: "perplexity-2",
        title: "Publish content with clear, direct answers",
        description: "Perplexity looks for concise, direct answers to user queries. Structure content to provide clear takeaways.",
        howTo: "Use clear headings that match search queries. Start sections with direct answers before expanding on details.",
        priority: "high",
        estimatedImpact: "High - Improves answer extraction"
      },
      {
        id: "perplexity-3",
        title: "Keep content fresh and updated",
        description: "Perplexity performs real-time searches and prefers recent content. Outdated content gets deprioritized.",
        howTo: "Regularly update existing content with new information. Add 'Last Updated' dates and refresh statistics annually.",
        priority: "high",
        estimatedImpact: "High - Freshness is a key ranking factor"
      },
      {
        id: "perplexity-4",
        title: "Optimize for featured snippet formats",
        description: "Perplexity often pulls from content formatted like Google featured snippets.",
        howTo: "Create numbered lists, definition paragraphs, and comparison tables. Use clear H2/H3 headings.",
        priority: "medium",
        estimatedImpact: "Medium-High - Improves content extraction"
      },
      {
        id: "perplexity-5",
        title: "Build topical authority with content clusters",
        description: "Cover topics comprehensively with interlinked content to establish domain expertise.",
        howTo: "Create pillar pages with supporting articles. Link related content together to show topical depth.",
        priority: "medium",
        estimatedImpact: "Medium - Signals expertise on topics",
        quickAction: { label: "Research Keywords", link: "/keyword-research" }
      }
    ]
  },
  {
    id: "google-ai",
    name: "Google AI Overview",
    icon: <SiGoogle className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "Google's AI Overview uses its search index and prioritizes E-E-A-T signals (Experience, Expertise, Authority, Trust).",
    keyFactors: ["E-E-A-T signals", "Search visibility", "User engagement", "Author expertise"],
    steps: [
      {
        id: "google-reg-1",
        title: "Verify your site in Google Search Console",
        description: "Google AI Overview pulls from its search index. Verifying your site in Search Console ensures Google knows about all your pages and can include them in AI-generated answers.",
        howTo: "Go to search.google.com/search-console, add your property, verify via DNS/HTML tag, submit your sitemap.xml, and monitor coverage reports. Fix any crawl errors promptly.",
        priority: "high",
        estimatedImpact: "Critical - Foundation for Google AI visibility",
        quickAction: { label: "Google Search Console", link: "https://search.google.com/search-console" }
      },
      {
        id: "google-reg-2",
        title: "Claim and complete your Google Business Profile",
        description: "For any business with a physical location or service area, Google Business Profile feeds directly into AI responses for local and business-related queries.",
        howTo: "Go to business.google.com, claim your business, verify ownership, then complete every field: hours, services, products, photos, Q&A. Respond to all reviews. Keep information 100% current.",
        priority: "high",
        estimatedImpact: "Very High for local/service businesses",
        quickAction: { label: "Google Business Profile", link: "https://business.google.com" }
      },
      {
        id: "google-reg-3",
        title: "Claim your Google Knowledge Panel",
        description: "A Knowledge Panel gives your brand a verified presence in Google's knowledge graph, which directly feeds into AI Overview responses.",
        howTo: "Search for your brand on Google. If a Knowledge Panel appears, click 'Claim this knowledge panel' at the bottom. If not, build your brand's presence on Wikipedia, Wikidata, and authoritative sources until one appears.",
        priority: "high",
        estimatedImpact: "High - Direct presence in Google's knowledge graph"
      },
      {
        id: "google-1",
        title: "Optimize for traditional Google SEO first",
        description: "Google AI Overview pulls from sites that already rank well in traditional search. Strong SEO is foundational.",
        howTo: "Follow Google's SEO best practices: optimize page speed, mobile experience, core web vitals, and on-page SEO.",
        priority: "high",
        estimatedImpact: "Critical - Foundation for AI visibility",
        quickAction: { label: "Analyze Signals", link: "/geo-signals" }
      },
      {
        id: "google-2",
        title: "Demonstrate author expertise (E-E-A-T)",
        description: "Google heavily weights author credentials, especially for YMYL topics.",
        howTo: "Add detailed author bios with credentials. Link to author profiles on LinkedIn, publications, and speaking engagements.",
        priority: "high",
        estimatedImpact: "High - Key trust signal"
      },
      {
        id: "google-3",
        title: "Create content that directly answers queries",
        description: "AI Overview selects content that clearly and concisely answers search queries.",
        howTo: "Research common questions in your industry. Structure content with the question as H2 and answer immediately following.",
        priority: "high",
        estimatedImpact: "High - Improves AI Overview selection",
        quickAction: { label: "Manage FAQs", link: "/faq-manager" }
      },
      {
        id: "google-4",
        title: "Get reviews and user-generated content",
        description: "Google values social proof and user engagement signals.",
        howTo: "Encourage customer reviews on Google Business Profile, industry review sites, and your own site.",
        priority: "medium",
        estimatedImpact: "Medium - Supports trust signals"
      },
      {
        id: "google-5",
        title: "Implement all relevant Schema markup",
        description: "Schema helps Google understand content relationships and context.",
        howTo: "Add FAQ, HowTo, Article, Organization, and Product schema. Validate with Rich Results Test.",
        priority: "medium",
        estimatedImpact: "Medium - Enhances content understanding"
      }
    ]
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: <SiGoogle className="w-6 h-6 text-foreground" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "Google's Gemini leverages Google's vast index and multimodal capabilities, favoring comprehensive, well-structured content.",
    keyFactors: ["Google index presence", "Multimodal content", "Comprehensive coverage", "Brand recognition"],
    steps: [
      {
        id: "gemini-reg-1",
        title: "Ensure Google Search Console and Business Profile are set up",
        description: "Gemini pulls primarily from Google's search index and knowledge graph. All Google registrations directly benefit your Gemini visibility.",
        howTo: "Complete the Google AI Overview registration steps first (Search Console + Business Profile). These same registrations power Gemini's data sources.",
        priority: "high",
        estimatedImpact: "Critical - Same data source as Google AI",
        quickAction: { label: "Google Search Console", link: "https://search.google.com/search-console" }
      },
      {
        id: "gemini-reg-2",
        title: "Submit to Google Merchant Center (for e-commerce)",
        description: "If you sell products, Google Merchant Center data feeds into Gemini's product recommendations and shopping features.",
        howTo: "Visit merchants.google.com, create an account, upload your product feed with complete data (titles, descriptions, prices, images, availability). Keep the feed updated daily.",
        priority: "high",
        estimatedImpact: "Very High for product/e-commerce brands",
        quickAction: { label: "Google Merchant Center", link: "https://merchants.google.com" }
      },
      {
        id: "gemini-1",
        title: "Maximize Google Search visibility",
        description: "Gemini primarily draws from Google's search index. High search rankings correlate with Gemini citations.",
        howTo: "Focus on ranking for your target keywords in Google Search. Use Search Console to monitor and improve performance.",
        priority: "high",
        estimatedImpact: "Critical - Primary data source",
        quickAction: { label: "Track Rankings", link: "/geo-rankings" }
      },
      {
        id: "gemini-2",
        title: "Create multimodal content (images, videos)",
        description: "Gemini is multimodal and can process images and videos. Rich media content may get additional visibility.",
        howTo: "Include original images, infographics, and videos in content. Add descriptive alt text and transcripts.",
        priority: "medium",
        estimatedImpact: "Medium - Differentiator for multimodal queries"
      },
      {
        id: "gemini-3",
        title: "Build brand recognition signals",
        description: "Gemini appears to weight brand recognition and search volume for brand terms.",
        howTo: "Invest in brand awareness through PR, advertising, and social media. Monitor branded search volume.",
        priority: "medium",
        estimatedImpact: "Medium - Long-term visibility boost"
      },
      {
        id: "gemini-4",
        title: "Ensure Google Business Profile is complete",
        description: "For local and business queries, Google Business Profile data feeds into Gemini responses.",
        howTo: "Complete all GBP fields, add photos, respond to reviews, and keep hours updated.",
        priority: "medium",
        estimatedImpact: "Medium - Important for local visibility"
      },
      {
        id: "gemini-5",
        title: "Create comprehensive topic coverage",
        description: "Gemini prefers sources that thoroughly cover a topic rather than superficial content.",
        howTo: "Build comprehensive resource centers on your key topics. Cover all aspects and frequently asked questions.",
        priority: "medium",
        estimatedImpact: "Medium-High - Establishes authority"
      }
    ]
  },
  {
    id: "grok",
    name: "Grok (xAI)",
    icon: <Zap className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "xAI's Grok has real-time access to X (Twitter) data and web search, prioritizing current information and social proof.",
    keyFactors: ["X/Twitter presence", "Real-time information", "Conversational authority", "Web indexing"],
    steps: [
      {
        id: "grok-reg-1",
        title: "Get X (Twitter) Verified for your business",
        description: "Grok has direct access to X data. A verified business account (gold checkmark) signals authority and increases the likelihood of being cited in Grok responses.",
        howTo: "Apply for X Verified Organizations at the X business portal. You'll need business documentation, an official email matching your domain, and an active website. Gold verification costs ~$1,000/month but provides significant credibility.",
        priority: "high",
        estimatedImpact: "Very High - Gold verification signals strong authority to Grok",
        quickAction: { label: "X Verified Organizations", link: "https://business.x.com" }
      },
      {
        id: "grok-reg-2",
        title: "Allow xAI's crawlers in your robots.txt",
        description: "Grok performs web searches beyond X data. Ensuring your site is crawlable by xAI's bots increases your chances of being cited.",
        howTo: "Add to your robots.txt:\n\nUser-agent: xai-grok\nAllow: /\n\nAlso ensure your site has a valid sitemap.xml and loads quickly.",
        priority: "high",
        estimatedImpact: "High - Required for web-based Grok answers",
        quickAction: { label: "Robots.txt Generator", link: "/crawler-check" }
      },
      {
        id: "grok-1",
        title: "Build a strong X (Twitter) presence",
        description: "Grok has direct access to X data. Active, authoritative accounts get cited more frequently.",
        howTo: "Post regularly on X with industry insights. Build followers, engage in discussions, and become a recognized voice in your space.",
        priority: "high",
        estimatedImpact: "Very High - Grok directly accesses X data"
      },
      {
        id: "grok-2",
        title: "Share timely, newsworthy content",
        description: "Grok emphasizes real-time information. Being first with accurate news improves visibility.",
        howTo: "Monitor industry news and share breaking updates with your expert commentary. Be a reliable source for timely information.",
        priority: "high",
        estimatedImpact: "High - Real-time relevance is key"
      },
      {
        id: "grok-3",
        title: "Engage in public conversations",
        description: "Grok learns from public discourse. Participating in visible discussions increases citation likelihood.",
        howTo: "Reply to industry threads, participate in X Spaces, and engage with other thought leaders publicly.",
        priority: "medium",
        estimatedImpact: "Medium-High - Social proof matters"
      },
      {
        id: "grok-4",
        title: "Ensure website is crawlable",
        description: "Grok performs web searches. Make sure your site is accessible and well-indexed.",
        howTo: "Verify your robots.txt allows crawling. Ensure fast page loads and mobile optimization.",
        priority: "medium",
        estimatedImpact: "Medium - Foundation for web-based answers",
        quickAction: { label: "Check Crawler Access", link: "/crawler-check" }
      },
      {
        id: "grok-5",
        title: "Create contrarian or unique perspectives",
        description: "Grok tends to surface diverse viewpoints. Unique, well-reasoned takes stand out.",
        howTo: "Don't just repeat conventional wisdom. Offer fresh perspectives backed by data or experience.",
        priority: "medium",
        estimatedImpact: "Medium - Differentiation in answers"
      }
    ]
  },
  {
    id: "manus",
    name: "Manus AI",
    icon: <Globe className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "Manus is an autonomous AI agent that executes tasks by browsing the web. It values actionable, structured information.",
    keyFactors: ["Structured content", "Clear CTAs", "Accessible web presence", "Task-oriented information"],
    steps: [
      {
        id: "manus-reg-1",
        title: "Ensure your website works without JavaScript",
        description: "Manus browses websites autonomously like a real user, but may not execute all JavaScript. Critical content should be available in the initial HTML for Manus to discover and use.",
        howTo: "Test your site with JavaScript disabled. Key content (product info, pricing, services, contact) should be visible in the HTML. Use server-side rendering where possible. Check that navigation works without JS.",
        priority: "high",
        estimatedImpact: "Critical - Manus needs to browse your site successfully",
        quickAction: { label: "Check Crawler Access", link: "/crawler-check" }
      },
      {
        id: "manus-reg-2",
        title: "Create machine-readable product/service data",
        description: "Manus compares options and makes recommendations. Having structured, machine-readable data (JSON-LD, API endpoints) makes it easier for Manus to understand and recommend your offerings.",
        howTo: "Implement Schema.org Product, Service, and Organization markup. Include pricing, features, availability, and reviews in structured format. Consider providing a public API or data feed for your products.",
        priority: "high",
        estimatedImpact: "High - Structured data enables accurate recommendations"
      },
      {
        id: "manus-1",
        title: "Structure content for task completion",
        description: "Manus executes tasks autonomously. Content structured as step-by-step guides gets used in workflows.",
        howTo: "Create clear how-to guides, tutorials, and documentation with numbered steps. Make content actionable.",
        priority: "high",
        estimatedImpact: "High - Task-oriented content is preferred"
      },
      {
        id: "manus-2",
        title: "Ensure clear calls-to-action",
        description: "Manus looks for actionable next steps. Clear CTAs help it recommend your solutions.",
        howTo: "Include obvious buttons, links, and instructions for taking action. Make conversion paths clear.",
        priority: "high",
        estimatedImpact: "High - Facilitates task execution"
      },
      {
        id: "manus-3",
        title: "Optimize for web browsing accessibility",
        description: "Manus browses websites like a user. Ensure your site is navigable and content is accessible.",
        howTo: "Use semantic HTML, clear navigation, and ensure content loads without JavaScript when possible.",
        priority: "high",
        estimatedImpact: "Critical - Required for browsing access",
        quickAction: { label: "Check Crawler Access", link: "/crawler-check" }
      },
      {
        id: "manus-4",
        title: "Provide complete product/service information",
        description: "Manus researches and compares options. Comprehensive information helps it recommend you.",
        howTo: "Include pricing, features, comparisons, and FAQs on your site. Answer common questions proactively.",
        priority: "medium",
        estimatedImpact: "Medium-High - Supports research tasks"
      },
      {
        id: "manus-5",
        title: "Maintain up-to-date contact and booking info",
        description: "Manus can complete tasks like booking or contacting. Current information enables conversions.",
        howTo: "Keep contact forms, booking systems, and availability information current and accessible.",
        priority: "medium",
        estimatedImpact: "Medium - Enables task completion"
      }
    ]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: <Search className="w-6 h-6" />,
    color: "text-foreground",
    bgColor: "bg-muted",
    description: "DeepSeek is a rapidly growing AI search engine from China that values authoritative technical content and structured data.",
    keyFactors: ["Crawler access", "Factual technical content", "Schema.org markup", "External citations"],
    steps: [
      {
        id: "deepseek-reg-1",
        title: "Allow DeepSeek crawler in robots.txt",
        description: "DeepSeek uses DeepSeekBot to index content. If your robots.txt blocks unknown crawlers, DeepSeek can't discover your site.",
        howTo: "Add to robots.txt:\nUser-agent: DeepSeekBot\nAllow: /\n\nVerify with your server logs that DeepSeekBot is fetching pages.",
        priority: "high",
        estimatedImpact: "Critical - Required for DeepSeek to index your content",
        quickAction: { label: "Check Crawler Access", link: "/crawler-check" }
      },
      {
        id: "deepseek-1",
        title: "Publish authoritative technical content",
        description: "DeepSeek prioritizes factually accurate, technically deep content. Surface-level marketing copy rarely gets cited.",
        howTo: "Write long-form technical articles with concrete data, code examples, benchmarks, and citations to primary sources.",
        priority: "high",
        estimatedImpact: "High - Technical depth improves citation rate"
      },
      {
        id: "deepseek-2",
        title: "Add Schema.org structured data",
        description: "Structured data helps DeepSeek understand the semantic meaning of your pages.",
        howTo: "Implement Schema.org Organization, Product, Article, and FAQ markup using JSON-LD. Validate with Google's Rich Results Test.",
        priority: "high",
        estimatedImpact: "High - Improves semantic understanding"
      },
      {
        id: "deepseek-3",
        title: "Build citations from credible external sources",
        description: "DeepSeek, like other AI engines, weighs external authority signals. Citations from trusted sources lift your rankings.",
        howTo: "Get mentioned on industry publications, Wikipedia, GitHub READMEs, academic papers, and reputable blogs. Quality over quantity.",
        priority: "medium",
        estimatedImpact: "Medium-High - Authority compounds over time"
      },
      {
        id: "deepseek-4",
        title: "Monitor DeepSeek indexing and submit via their API",
        description: "DeepSeek is releasing indexing APIs. Early adopters who submit content directly get faster inclusion.",
        howTo: "Check platform.deepseek.com for indexing API documentation. When available, submit new articles programmatically.",
        priority: "low",
        estimatedImpact: "Low-Medium - Future-proofing"
      }
    ]
  }
];

export default function AIVisibility() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = usePersistedState<string>("vc_visibility_brandId", "");
  const [selectedEngineId, setSelectedEngineId] = usePersistedState<string>("vc_visibility_engine", aiEngines[0].id);
  const [completedSteps, setCompletedSteps] = useState<Record<string, string[]>>({});

  const queryClient = useQueryClient();

  const { data: brandsResponse, isLoading: brandsLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsResponse?.data || [];

  // Auto-select a brand: pick the first if no valid selection exists (covers
  // first brand creation, deleted brand, returning users). Multi-brand users
  // keep their last-used brand via usePersistedState.
  useEffect(() => {
    if (brands.length > 0 && (!selectedBrandId || !brands.find(b => b.id === selectedBrandId))) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  // Server-side per-brand checklist progress.
  const progressQueryKey = [`/api/visibility-progress/${selectedBrandId}`];
  const { data: progressResponse } = useQuery<{ success: boolean; data: Record<string, string[]> }>({
    queryKey: progressQueryKey,
    enabled: !!selectedBrandId,
  });

  useEffect(() => {
    setCompletedSteps(progressResponse?.data ?? {});
  }, [progressResponse, selectedBrandId]);

  const toggleStepMutation = useMutation({
    mutationFn: async ({ engineId, stepId, completed }: { engineId: string; stepId: string; completed: boolean }) => {
      const method = completed ? "POST" : "DELETE";
      const response = await apiRequest(method, `/api/visibility-progress/${selectedBrandId}`, { engineId, stepId });
      return response.json();
    },
    onError: (_err, vars) => {
      // Roll back the optimistic update on failure.
      setCompletedSteps(prev => {
        const engineSteps = prev[vars.engineId] || [];
        const next = vars.completed
          ? engineSteps.filter(id => id !== vars.stepId)
          : [...engineSteps, vars.stepId];
        return { ...prev, [vars.engineId]: next };
      });
      toast({
        title: "Could not save progress",
        description: "Your change wasn't saved. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: progressQueryKey });
    },
  });

  const toggleStep = (engineId: string, stepId: string) => {
    if (!selectedBrandId) {
      toast({
        title: "Select a brand first",
        description: "Choose a brand from the dropdown above to start tracking progress.",
        variant: "destructive",
      });
      return;
    }
    const engineSteps = completedSteps[engineId] || [];
    const isCompleting = !engineSteps.includes(stepId);
    // Optimistic update — server call follows.
    setCompletedSteps(prev => {
      const cur = prev[engineId] || [];
      const next = isCompleting ? [...cur, stepId] : cur.filter(id => id !== stepId);
      return { ...prev, [engineId]: next };
    });
    toggleStepMutation.mutate({ engineId, stepId, completed: isCompleting });
  };

  const getEngineProgress = (engine: AIEngine) => {
    const completed = (completedSteps[engine.id] || []).length;
    const total = engine.steps.length;
    return { completed, total, percentage: Math.round((completed / total) * 100) };
  };

  const getTotalProgress = () => {
    let completed = 0;
    let total = 0;
    aiEngines.forEach(engine => {
      completed += (completedSteps[engine.id] || []).length;
      total += engine.steps.length;
    });
    return { completed, total, percentage: Math.round((completed / total) * 100) };
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge className="bg-foreground text-background border-transparent">High Priority</Badge>;
      case "medium":
        return <Badge className="bg-muted text-foreground border-border">Medium</Badge>;
      case "low":
        return <Badge variant="outline" className="text-muted-foreground border-border">Low</Badge>;
      default:
        return null;
    }
  };

  const totalProgress = getTotalProgress();

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Engine Visibility Recommendations"
        description="Step-by-step checklists to get your brand cited by each major AI search engine"
      />

      <div className="flex flex-wrap gap-4 mb-8 items-center justify-between">
        <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
          <SelectTrigger className="w-64" data-testid="select-brand">
            <SelectValue placeholder="Select a brand..." />
          </SelectTrigger>
          <SelectContent>
            {brands.map(brand => (
              <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Card className="bg-card border border-border">
          <CardContent className="py-4 px-6">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground" data-testid="total-progress">{totalProgress.completed}/{totalProgress.total}</p>
                <p className="text-sm text-muted-foreground">Steps Completed</p>
              </div>
              <div className="flex-1 min-w-[150px]">
                <Progress value={totalProgress.percentage} className="h-3" />
                <p className="text-sm text-muted-foreground mt-1">{totalProgress.percentage}% complete</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {aiEngines.map(engine => {
          const progress = getEngineProgress(engine);
          const isSelected = engine.id === selectedEngineId;
          return (
            <Card
              key={engine.id}
              onClick={() => setSelectedEngineId(engine.id)}
              className={`${engine.bgColor} border cursor-pointer transition-all hover:border-foreground/40 ${isSelected ? 'border-foreground ring-2 ring-foreground/30' : progress.percentage === 100 ? 'border-foreground' : 'border-border'}`}
              data-testid={`engine-card-${engine.id}`}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={engine.color}>{engine.icon}</span>
                  <span className="font-semibold">{engine.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={progress.percentage} className="h-2 flex-1" />
                  <span className="text-sm font-medium" data-testid={`progress-${engine.id}`}>{progress.completed}/{progress.total}</span>
                </div>
                {progress.percentage === 100 && (
                  <Badge className="mt-2 bg-foreground text-background">Complete</Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(() => {
        const engine = aiEngines.find(e => e.id === selectedEngineId) || aiEngines[0];
        const progress = getEngineProgress(engine);
        return (
          <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <span className={engine.color}>{engine.icon}</span>
                        {engine.name} Visibility Checklist
                      </CardTitle>
                      <CardDescription className="mt-2">{engine.description}</CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" data-testid={`engine-progress-${engine.id}`}>{progress.completed}/{progress.total}</p>
                      <p className="text-sm text-muted-foreground">completed</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <span className="text-sm font-medium text-muted-foreground">Key factors:</span>
                    {engine.keyFactors.map((factor, i) => (
                      <Badge key={i} variant="outline">{factor}</Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="space-y-3">
                    {engine.steps.map((step, index) => {
                      const isCompleted = (completedSteps[engine.id] || []).includes(step.id);
                      return (
                        <AccordionItem 
                          key={step.id} 
                          value={step.id} 
                          className={`border rounded-lg px-4 ${isCompleted ? 'bg-muted border-border' : 'bg-card'}`}
                          data-testid={`step-${step.id}`}
                        >
                          <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-4 text-left w-full">
                              <Checkbox 
                                checked={isCompleted}
                                onCheckedChange={() => toggleStep(engine.id, step.id)}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-${step.id}`}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">Step {index + 1}: {step.title}</span>
                                  {getPriorityBadge(step.priority)}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                              </div>
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-foreground flex-shrink-0" />
                              ) : (
                                <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0" />
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4">
                            <div className="ml-10 space-y-4">
                              <div className="bg-muted p-4 rounded-lg">
                                <h4 className="font-medium flex items-center gap-2 mb-2">
                                  <Lightbulb className="w-4 h-4 text-muted-foreground" />
                                  How to do this:
                                </h4>
                                <p className="text-sm text-foreground">{step.howTo}</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                  <Target className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">Expected Impact:</span>
                                  <span className="text-muted-foreground">{step.estimatedImpact}</span>
                                </div>
                                {step.quickAction && (
                                  <Link href={step.quickAction.link}>
                                    <Button size="sm" variant="outline" className="gap-2" data-testid={`action-${step.id}`}>
                                      {step.quickAction.label}
                                      <ArrowRight className="w-4 h-4" />
                                    </Button>
                                  </Link>
                                )}
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
          </div>
        );
      })()}

      <Card className="mt-8 bg-card border border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-muted-foreground" />
            Quick Wins: Start Here
          </CardTitle>
          <CardDescription>These high-priority steps give you the best return on effort</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {aiEngines.flatMap(engine => 
              engine.steps
                .filter(step => step.priority === "high" && !(completedSteps[engine.id] || []).includes(step.id))
                .slice(0, 1)
                .map(step => (
                  <Card key={step.id} className="bg-card">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={engine.color}>{engine.icon}</span>
                        <span className="text-sm font-medium">{engine.name}</span>
                      </div>
                      <h4 className="font-medium mb-2">{step.title}</h4>
                      <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          checked={(completedSteps[engine.id] || []).includes(step.id)}
                          onCheckedChange={() => toggleStep(engine.id, step.id)}
                          data-testid={`quick-checkbox-${step.id}`}
                        />
                        <span className="text-sm">Mark as done</span>
                        {step.quickAction && (
                          <Link href={step.quickAction.link}>
                            <Button size="sm" variant="ghost" className="ml-auto" data-testid={`quick-action-${step.id}`}>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
