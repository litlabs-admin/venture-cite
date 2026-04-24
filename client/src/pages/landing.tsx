import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Helmet } from "react-helmet-async";
import logoPath from "@assets/logo.png";
import {
  ArrowRight,
  Target,
  Brain,
  CheckCircle2,
  Sparkles,
  FileText,
  Shield,
  LineChart,
  MessageSquare,
  Quote,
  ChevronDown,
  ChevronUp,
  Award,
  Lock,
  Mail,
  Star,
  Check,
  X,
  Zap,
  Users,
  BarChart3,
  Rocket,
  Twitter,
  Linkedin,
  Instagram,
  Youtube,
  Menu,
} from "lucide-react";
import { SiOpenai, SiStripe } from "react-icons/si";

function useScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Landing() {
  const [monthlyTraffic, setMonthlyTraffic] = useState([50000]);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useScrollReveal();

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(1200px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg)`;
    };
    const reset = () => {
      el.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
    };
    el.addEventListener("mousemove", handler);
    el.addEventListener("mouseleave", reset);
    return () => {
      el.removeEventListener("mousemove", handler);
      el.removeEventListener("mouseleave", reset);
    };
  }, []);

  const estimatedCitations = Math.round(monthlyTraffic[0] * 0.023);
  const estimatedRevenue = Math.round(estimatedCitations * 12.5);
  const annualValue = estimatedRevenue * 12;

  const features = [
    {
      icon: Brain,
      title: "Share of Answer Tracking",
      description:
        "Track exactly how often AI engines mention your brand when users ask relevant questions.",
      accent: "bg-red-50",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
    },
    {
      icon: Target,
      title: "Citation Intelligence",
      description:
        "Monitor when and where your content gets cited across ChatGPT, Claude, Perplexity, and more.",
      accent: "bg-blue-50",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      icon: LineChart,
      title: "Client Reporting Dashboard",
      description:
        "Professional reports with KPIs: Brand Mention Frequency, Share of Voice, Citation Rate, and Prompt Coverage.",
      accent: "bg-emerald-50",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      icon: FileText,
      title: "AI Content Generation",
      description:
        "Generate citation-optimized articles and FAQs designed to get cited by generative engines.",
      accent: "bg-amber-50",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
  ];

  const coreFeatures = [
    {
      icon: Brain,
      title: "Smart Tracking",
      description: "Automatically monitor, capture, and surface every AI citation as it happens.",
    },
    {
      icon: Zap,
      title: "Auto Workflows",
      description:
        "Create optimization rules once and let VentureCite handle content updates forever.",
    },
    {
      icon: Users,
      title: "Team Sync",
      description:
        "Real-time reports, shared dashboards, and smoother collaboration across brands.",
    },
    {
      icon: BarChart3,
      title: "Insights Hub",
      description: "Get clear reports on visibility, growth, and opportunities — instantly.",
    },
    {
      icon: Target,
      title: "Easy Integrations",
      description: "Connect your favorite tools and keep your entire workflow in one place.",
    },
    {
      icon: Lock,
      title: "Secure Space",
      description:
        "Your brand data stays encrypted, protected, and available whenever you need it.",
    },
  ];

  const stats = [
    { value: "47%", label: "Average visibility increase", desc: "in first 90 days" },
    { value: "2.3x", label: "More citations", desc: "vs. traditional SEO" },
    { value: "150+", label: "Brands optimized", desc: "across industries" },
  ];

  const aiPlatforms = [
    "ChatGPT",
    "Claude",
    "Perplexity",
    "Gemini",
    "Google AI Overview",
    "Copilot",
  ];

  const pillars = [
    {
      num: "01",
      title: "Smarter Automation",
      desc: "Automate repetitive tasks with intelligent rules that adapt to your workflow and increase potential revenue.",
    },
    {
      num: "02",
      title: "Live Performance Insights",
      desc: "Get instant visibility into progress, blockers, and team efficiency with real-time, accurate analytics.",
    },
    {
      num: "03",
      title: "One-Click Integrations",
      desc: "Connect VentureCite with your favorite tools in seconds to create a truly unified, seamless workspace.",
    },
    {
      num: "04",
      title: "Zero-Delay Collaboration",
      desc: "Real-time citation monitoring across all major AI platforms keeps your team aligned from day one.",
    },
    {
      num: "05",
      title: "Bank-Level Security",
      desc: "Enterprise-grade encryption and SOC 2 compliance protect your brand data at every layer.",
    },
    {
      num: "06",
      title: "Fast, Frictionless Setup",
      desc: "From signup to AI visibility improvement in under 10 minutes. No technical knowledge required.",
    },
  ];

  const testimonials = [
    {
      quote:
        "By 2026, traditional search engine volume will drop 25% as users embrace AI chatbots and virtual agents. Brands need to optimize for AI discovery now.",
      author: "Gartner Research",
      role: "2024 Prediction",
      company: "",
      avatar: "GR",
    },
    {
      quote:
        "The future of search is conversational. Brands that aren't optimizing for AI-generated answers will be invisible to a growing segment of consumers.",
      author: "Rand Fishkin",
      role: "CEO",
      company: "SparkToro",
      avatar: "RF",
    },
    {
      quote:
        "GEO is the new SEO. As AI becomes the primary interface for information discovery, traditional optimization strategies become obsolete.",
      author: "Marketing AI Institute",
      role: "Industry Report",
      company: "",
      avatar: "MA",
    },
  ];

  const faqs = [
    {
      q: "What is Generative Engine Optimization (GEO)?",
      a: "GEO is the practice of optimizing your content and brand presence to appear in AI-generated responses from ChatGPT, Claude, Perplexity, Google AI Overview, and other AI search engines. Unlike traditional SEO which focuses on Google's 10 blue links, GEO focuses on getting your brand cited when AI answers user questions.",
    },
    {
      q: "How long does it take to see results?",
      a: "Most customers see measurable improvements within 30-60 days. Initial citation tracking begins immediately, and content optimization typically shows impact within 2-4 weeks as AI models refresh their knowledge bases.",
    },
    {
      q: "Which AI platforms do you track?",
      a: "We track citations across ChatGPT (including GPT-4), Claude, Perplexity, Google AI Overview, Gemini, Microsoft Copilot, and other emerging AI search platforms. We continuously add new platforms as they gain market share.",
    },
    {
      q: "How is VentureCite different from Searchable.ai?",
      a: "While both platforms track AI citations, VentureCite offers additional features like AI-optimized content generation, publication outreach automation, honest GEO signal scoring, and ROI tracking—all at a lower price point ($79/mo vs $149/mo).",
    },
    {
      q: "Do I need technical knowledge to use VentureCite?",
      a: "No technical knowledge required. Our platform is designed for marketing teams and business owners. Simply add your brand, and we handle the technical optimization, tracking, and reporting automatically.",
    },
    {
      q: "Can I cancel my subscription anytime?",
      a: "Yes, you can cancel your subscription at any time with no cancellation fees. Your access continues until the end of your billing period.",
    },
  ];

  const pricing = [
    {
      name: "Free",
      price: "$0",
      desc: "Great for trying out VentureCite features and templates.",
      featured: false,
    },
    {
      name: "Professional",
      price: "$79",
      desc: "Best for solo founders, freelancers & growing teams.",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "$257",
      desc: "Ideal for scaling companies that need deep automation & custom setups.",
      featured: false,
    },
  ];

  return (
    <>
      <Helmet>
        <title>VentureCite - Get Cited by AI Search Engines</title>
        <meta
          name="description"
          content="Track and optimize your brand's visibility in AI-powered search. Monitor citations across ChatGPT, Claude, Perplexity, and more."
        />
        <meta property="og:title" content="VentureCite - Generative Engine Optimization" />
        <meta property="og:description" content="The leading platform for AI search visibility." />
      </Helmet>

      <div className="min-h-screen bg-[#f2f1ed] text-gray-900 font-sans antialiased overflow-x-hidden">
        {/* ── Navbar ── */}
        <nav className="sticky top-0 z-50 bg-[#f2f1ed]/90 backdrop-blur-md border-b border-gray-200/50">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="flex items-center justify-between h-16 lg:h-18">
              <Link href="/" className="flex items-center gap-2 group" data-testid="link-logo">
                <img
                  src={logoPath}
                  alt="VentureCite"
                  className="h-10 lg:h-12 w-auto transition-transform duration-300 group-hover:scale-105"
                />
              </Link>

              <div className="hidden md:flex items-center gap-8 xl:gap-10 text-sm lg:text-[15px] text-gray-600">
                {[
                  { href: "#about", label: "About Us" },
                  { href: "#features", label: "Features" },
                  { href: "#pricing", label: "Pricing" },
                  { href: "#faq", label: "FAQ" },
                ].map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="relative hover:text-gray-900 transition-colors duration-200 after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-red-600 after:transition-all after:duration-300 hover:after:w-full"
                  >
                    {l.label}
                  </a>
                ))}
              </div>

              <div className="flex items-center gap-2 lg:gap-3">
                <a href="/login" className="hidden sm:inline-flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full px-4 lg:px-5 lg:text-sm"
                    data-testid="button-nav-login"
                  >
                    Log in
                  </Button>
                </a>
                <a href="/register">
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white rounded-full px-5 lg:px-6 lg:text-sm shadow-sm hover:shadow-md hover:shadow-red-200 hover:-translate-y-0.5 transition-all duration-200"
                    data-testid="button-nav-cta"
                  >
                    Get Started
                  </Button>
                </a>
                <button
                  className="md:hidden p-2 text-gray-600 hover:text-gray-900"
                  onClick={() => setMobileNavOpen(!mobileNavOpen)}
                  aria-label="Toggle menu"
                >
                  {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {mobileNavOpen && (
              <div className="md:hidden py-3 border-t border-gray-200/60 animate-fade-in-up">
                <div className="flex flex-col gap-1 text-sm">
                  {[
                    { href: "#about", label: "About Us" },
                    { href: "#features", label: "Features" },
                    { href: "#pricing", label: "Pricing" },
                    { href: "#faq", label: "FAQ" },
                    { href: "/login", label: "Log in" },
                  ].map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      className="py-2 px-1 text-gray-600 hover:text-gray-900 transition-colors"
                      onClick={() => setMobileNavOpen(false)}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="relative pt-20 lg:pt-28 xl:pt-32 pb-16 lg:pb-24 xl:pb-28 overflow-hidden">
          <div
            className="absolute top-0 -left-40 w-80 lg:w-[32rem] h-80 lg:h-[32rem] bg-red-200/25 rounded-full blur-3xl animate-blob-drift pointer-events-none"
            aria-hidden
          />
          <div
            className="absolute top-32 -right-40 w-96 lg:w-[36rem] h-96 lg:h-[36rem] bg-orange-200/25 rounded-full blur-3xl animate-blob-drift pointer-events-none"
            style={{ animationDelay: "-7s" }}
            aria-hidden
          />

          <div className="max-w-7xl mx-auto px-6 xl:px-10 relative">
            <div className="max-w-5xl mx-auto text-center">
              {/* Launch badge */}
              <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 mb-6 lg:mb-8 shadow-sm animate-fade-in-up hover:border-red-200 hover:shadow-md transition-all duration-300">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                  <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
                </span>
                <Sparkles className="w-3.5 h-3.5 text-red-600" />
                <span className="text-sm lg:text-base text-gray-600">
                  Generative Engine Optimization
                </span>
              </div>

              <h1
                className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold mb-5 lg:mb-6 leading-[1.04] tracking-[-0.04em] text-gray-900 animate-fade-in-up"
                style={{ animationDelay: "0.08s" }}
                data-testid="text-hero-title"
              >
                Get Cited by
                <span className="block text-gradient-red">AI Search Engines</span>
              </h1>

              <p
                className="text-base md:text-lg lg:text-xl xl:text-2xl text-gray-500 mb-8 lg:mb-10 max-w-2xl lg:max-w-3xl mx-auto leading-relaxed animate-fade-in-up"
                style={{ animationDelay: "0.16s" }}
                data-testid="text-hero-description"
              >
                Track your brand's visibility across ChatGPT, Claude, Perplexity, and Gemini.
                Optimize content that AI engines want to cite.
              </p>

              <div
                className="flex flex-col sm:flex-row gap-3 lg:gap-4 justify-center mb-12 lg:mb-16 animate-fade-in-up"
                style={{ animationDelay: "0.24s" }}
              >
                <a href="/register">
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white rounded-full h-12 lg:h-14 px-7 lg:px-9 text-sm lg:text-base font-medium shadow-sm hover:shadow-xl hover:shadow-red-300/40 hover:-translate-y-0.5 transition-all duration-300 w-full sm:w-auto group"
                    data-testid="button-hero-cta"
                  >
                    Start Free Trial
                    <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </a>
                <Link href="/pricing">
                  <Button
                    variant="outline"
                    className="bg-white border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300 rounded-full h-12 lg:h-14 px-7 lg:px-9 text-sm lg:text-base font-medium w-full sm:w-auto hover:-translate-y-0.5 transition-all duration-300"
                    data-testid="button-hero-pricing"
                  >
                    View Pricing
                  </Button>
                </Link>
              </div>

              {/* Dashboard preview */}
              <div
                ref={heroRef}
                className="relative mx-auto animate-fade-in-up transition-transform duration-500 will-change-transform"
                style={{ animationDelay: "0.32s" }}
              >
                <div className="bg-white rounded-2xl lg:rounded-3xl shadow-2xl shadow-gray-900/10 border border-gray-200/60 overflow-hidden">
                  <div className="grid grid-cols-12 min-h-[380px] lg:min-h-[500px] xl:min-h-[560px]">
                    <aside className="col-span-3 bg-gray-50/80 p-5 lg:p-7 border-r border-gray-100 hidden md:block">
                      <div className="flex items-center gap-2 mb-6 lg:mb-8">
                        <img src={logoPath} alt="" className="h-7 lg:h-9 w-auto" />
                      </div>
                      <nav className="space-y-1">
                        {[
                          { icon: LineChart, label: "Dashboard", active: true },
                          { icon: Target, label: "Brands", active: false },
                          { icon: FileText, label: "Content", active: false },
                          { icon: Brain, label: "AI Intelligence", active: false },
                        ].map(({ icon: Icon, label, active }) => (
                          <div
                            key={label}
                            className={`flex items-center gap-3 px-3 py-2 lg:py-2.5 rounded-lg text-sm lg:text-base transition-colors ${
                              active
                                ? "bg-red-50 text-red-700 font-medium"
                                : "text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            <Icon className="w-4 h-4 lg:w-5 lg:h-5 flex-shrink-0" />
                            {label}
                          </div>
                        ))}
                      </nav>
                    </aside>
                    <main className="col-span-12 md:col-span-9 p-5 lg:p-8 xl:p-10 text-left">
                      <div className="flex items-center gap-3 mb-5 lg:mb-6 pb-4 border-b border-gray-100">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-red-400" />
                          <div className="w-3 h-3 rounded-full bg-yellow-400" />
                          <div className="w-3 h-3 rounded-full bg-green-400" />
                        </div>
                        <span className="text-xs lg:text-sm text-gray-400">
                          venturecite.com/dashboard
                        </span>
                      </div>
                      <div className="mb-5 lg:mb-7">
                        <h3 className="text-lg lg:text-xl xl:text-2xl font-semibold text-gray-900">
                          Good Morning, Team
                        </h3>
                        <p className="text-sm lg:text-base text-gray-500">
                          Your AI visibility is climbing today
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 lg:gap-5 mb-5 lg:mb-7">
                        {[
                          {
                            bg: "bg-red-50",
                            value: "23.4%",
                            label: "Share of Answer",
                            color: "text-red-600",
                          },
                          {
                            bg: "bg-emerald-50",
                            value: "847",
                            label: "Citations This Week",
                            color: "text-emerald-600",
                          },
                          {
                            bg: "bg-blue-50",
                            value: "+12.3%",
                            label: "Growth Rate",
                            color: "text-blue-600",
                          },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className={`${stat.bg} rounded-xl lg:rounded-2xl p-4 lg:p-5 hover:scale-[1.02] transition-transform duration-300`}
                          >
                            <div
                              className={`text-2xl lg:text-3xl xl:text-4xl font-bold ${stat.color}`}
                            >
                              {stat.value}
                            </div>
                            <div className="text-xs lg:text-sm text-gray-600 mt-1">
                              {stat.label}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-gray-50 rounded-xl lg:rounded-2xl p-4 lg:p-5 hover:bg-gray-100/70 transition-colors duration-300">
                        <div className="flex items-center gap-2 mb-2 lg:mb-3">
                          <MessageSquare className="w-4 h-4 lg:w-5 lg:h-5 text-red-600" />
                          <span className="text-xs lg:text-sm text-gray-600 font-medium">
                            Latest AI Citation
                          </span>
                        </div>
                        <p className="text-sm lg:text-base text-gray-700 leading-relaxed">
                          "According to{" "}
                          <span className="text-red-600 font-medium">VentureCite</span>, optimizing
                          for AI search requires..."
                        </p>
                        <div className="flex items-center gap-2 mt-2 lg:mt-3">
                          <Badge
                            variant="secondary"
                            className="text-xs bg-white border-gray-200 text-gray-600"
                          >
                            ChatGPT
                          </Badge>
                          <span className="text-xs lg:text-sm text-gray-400">2 minutes ago</span>
                        </div>
                      </div>
                    </main>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── AI Platforms bar ── */}
        <section className="py-10 lg:py-14 border-y border-gray-200/60">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <p className="text-center text-xs lg:text-sm text-gray-400 uppercase tracking-widest mb-6 lg:mb-8 reveal">
              Tracking citations across
            </p>
            <div className="flex flex-wrap justify-center gap-x-10 lg:gap-x-16 xl:gap-x-20 gap-y-3">
              {aiPlatforms.map((platform, i) => (
                <span
                  key={platform}
                  className="text-gray-400 font-semibold text-base lg:text-lg xl:text-xl tracking-tight hover:text-red-600 transition-colors duration-300 reveal"
                  style={{ transitionDelay: `${i * 50}ms` }}
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── About ── */}
        <section id="about" className="py-20 lg:py-28 xl:py-32">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div className="reveal">
                <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 mb-5 lg:mb-6 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm lg:text-base text-gray-600">About Us</span>
                </div>
                <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-5 lg:mb-6 leading-[1.06] tracking-[-0.03em] text-gray-900">
                  Your content has the answers. AI just needs to find it.
                </h2>
                <p className="text-base lg:text-lg xl:text-xl text-gray-500 leading-relaxed">
                  VentureCite is built on a simple idea — your brand should show up wherever people
                  ask questions. We analyze how AI engines understand and cite your content, then
                  help you optimize for maximum visibility in AI-generated responses.
                </p>
              </div>
              <div className="relative reveal reveal-delay-2">
                <div className="aspect-square max-w-sm lg:max-w-md xl:max-w-lg mx-auto bg-gradient-to-br from-red-100 via-rose-50 to-orange-50 rounded-3xl flex items-center justify-center shadow-xl shadow-red-100/50 animate-float">
                  <div className="relative w-2/3 h-2/3">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-red-700 rounded-2xl rotate-6 opacity-30 animate-pulse-soft" />
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-500 rounded-2xl shadow-2xl" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Rocket className="w-20 lg:w-28 xl:w-32 h-20 lg:h-28 xl:h-32 text-white drop-shadow-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Waitlist ── */}
        <section className="py-14 lg:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="max-w-2xl mx-auto text-center reveal">
              <Badge
                className="mb-4 bg-red-50 text-red-600 border-red-200 rounded-full"
                data-testid="badge-waitlist"
              >
                <Mail className="w-3 h-3 mr-1.5" /> Join the Waitlist
              </Badge>
              <h2
                className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 text-gray-900"
                data-testid="text-waitlist-title"
              >
                Get Early Access & Updates
              </h2>
              <p className="text-gray-500 text-sm lg:text-base mb-6 lg:mb-8">
                Join 500+ marketers tracking AI visibility. Be first to know about new features.
              </p>

              {emailSubmitted ? (
                <div
                  className="flex items-center justify-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-full px-6 py-3 animate-fade-in-up"
                  data-testid="waitlist-success"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm lg:text-base">
                    You're on the list! We'll be in touch soon.
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!email) return;
                    try {
                      const res = await fetch("/api/waitlist", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, source: "landing" }),
                      });
                      let data: any = {};
                      try {
                        data = await res.json();
                      } catch {}
                      if (res.ok && data.success) setEmailSubmitted(true);
                    } catch {}
                  }}
                  className="flex flex-col sm:flex-row gap-3 max-w-md lg:max-w-lg mx-auto"
                  data-testid="form-waitlist"
                >
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 h-11 lg:h-12 rounded-full px-5 focus-visible:ring-red-500 text-sm lg:text-base"
                    data-testid="input-waitlist-email"
                  />
                  <Button
                    type="submit"
                    className="bg-red-600 hover:bg-red-700 text-white h-11 lg:h-12 px-6 lg:px-7 whitespace-nowrap rounded-full hover:shadow-md hover:shadow-red-200 hover:-translate-y-0.5 transition-all duration-200 text-sm lg:text-base"
                    data-testid="button-waitlist-submit"
                  >
                    Join Waitlist
                  </Button>
                </form>
              )}
              <p className="text-xs lg:text-sm text-gray-400 mt-3">No spam. Unsubscribe anytime.</p>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="py-16 lg:py-24 xl:py-28">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="grid md:grid-cols-3 gap-8 lg:gap-12 xl:gap-16 max-w-5xl xl:max-w-6xl mx-auto">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className="text-center reveal"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold text-gradient-red mb-3 tracking-[-0.04em]">
                    {stat.value}
                  </div>
                  <div className="text-base lg:text-lg xl:text-xl font-medium text-gray-900 mb-1">
                    {stat.label}
                  </div>
                  <div className="text-sm lg:text-base text-gray-500">{stat.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features — Built for the AI Search Era ── */}
        <section className="py-16 lg:py-24 bg-white" id="features">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 reveal">
              <div className="inline-flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5 mb-4 lg:mb-5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm lg:text-base text-gray-600">Core Capabilities</span>
              </div>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-4 text-gray-900 tracking-[-0.03em]"
                data-testid="text-features-title"
              >
                Built for the AI Search Era
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500 max-w-2xl lg:max-w-3xl mx-auto">
                Traditional SEO tools weren't built for generative AI. VentureCite was.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {features.map((feature, i) => (
                <div
                  key={feature.title}
                  className={`group ${feature.accent} rounded-2xl lg:rounded-3xl p-6 lg:p-8 card-lift hover:shadow-xl hover:shadow-gray-200/60 reveal`}
                  style={{ transitionDelay: `${i * 70}ms` }}
                  data-testid={`feature-card-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div
                    className={`w-11 h-11 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl ${feature.iconBg} flex items-center justify-center mb-5 lg:mb-6 ${feature.iconColor} transition-all duration-500 group-hover:rotate-6 group-hover:scale-110`}
                  >
                    <feature.icon className="w-5 h-5 lg:w-6 lg:h-6" />
                  </div>
                  <h3 className="text-base lg:text-lg xl:text-xl font-semibold mb-2 lg:mb-3 text-gray-900">
                    {feature.title}
                  </h3>
                  <p className="text-gray-500 text-sm lg:text-base leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Core Features 6-grid ── */}
        <section id="why" className="py-20 lg:py-28 xl:py-32">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-12 lg:mb-16 max-w-2xl lg:max-w-3xl mx-auto reveal">
              <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 mb-4 lg:mb-5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm lg:text-base text-gray-600">Why VentureCite</span>
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-4 tracking-[-0.03em] text-gray-900">
                Everything You Need. Nothing Extra.
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500">
                A tight, powerful set of features crafted to make your team faster and more focused.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-x-8 lg:gap-x-12 xl:gap-x-16 gap-y-10 lg:gap-y-14">
              {coreFeatures.map((f, i) => (
                <div
                  key={f.title}
                  className="text-center group reveal"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <div className="w-14 h-14 lg:w-16 lg:h-16 xl:w-18 xl:h-18 mx-auto mb-4 lg:mb-5 flex items-center justify-center rounded-2xl bg-white border border-gray-200/60 shadow-sm group-hover:border-red-200 group-hover:shadow-red-100/50 group-hover:-translate-y-1 transition-all duration-300">
                    <f.icon
                      className="w-6 h-6 lg:w-7 lg:h-7 text-gray-700 group-hover:text-red-600 transition-colors duration-300"
                      strokeWidth={1.6}
                    />
                  </div>
                  <h3 className="text-base lg:text-lg xl:text-xl font-semibold mb-2 lg:mb-3 text-gray-900">
                    {f.title}
                  </h3>
                  <p className="text-gray-500 text-sm lg:text-base leading-relaxed max-w-xs mx-auto">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Content has answers + Citations card ── */}
        <section className="py-16 lg:py-24 border-y border-gray-200/60 bg-white">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="grid md:grid-cols-2 gap-10 lg:gap-16 xl:gap-24 items-center">
              <div className="reveal">
                <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-5 lg:mb-6 text-gray-900 tracking-[-0.03em] leading-[1.06]">
                  Your content has the answers.
                  <span className="block text-gray-400">AI just needs to find it.</span>
                </h2>
                <p className="text-gray-500 text-sm lg:text-base xl:text-lg mb-6 lg:mb-8 leading-relaxed">
                  We analyze how AI engines understand and cite your content. Then we help you
                  optimize for maximum visibility in AI-generated responses.
                </p>
                <div className="space-y-3 lg:space-y-4">
                  {[
                    "Real-time citation monitoring across all major AI platforms",
                    "AI-optimized content generation with brand voice",
                    "Competitive intelligence and share-of-answer tracking",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 group">
                      <CheckCircle2 className="w-5 h-5 lg:w-6 lg:h-6 text-emerald-600 mt-0.5 flex-shrink-0 transition-transform group-hover:scale-110" />
                      <span className="text-sm lg:text-base text-gray-600">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#f2f1ed] border border-gray-200/60 rounded-2xl lg:rounded-3xl p-5 lg:p-7 reveal reveal-delay-2">
                <div className="space-y-2 lg:space-y-3">
                  {[
                    { name: "ChatGPT Citations", value: 342 },
                    { name: "Claude Citations", value: 256 },
                    { name: "Perplexity Citations", value: 189 },
                    { name: "Gemini Citations", value: 128 },
                  ].map((r, i) => (
                    <div
                      key={r.name}
                      className="flex items-center justify-between p-4 lg:p-5 bg-white rounded-xl lg:rounded-2xl border border-gray-200/60 hover:border-red-200 hover:shadow-sm transition-all duration-300 group"
                      style={{ transitionDelay: `${i * 50}ms` }}
                    >
                      <span className="text-sm lg:text-base text-gray-600">{r.name}</span>
                      <span className="text-base lg:text-lg xl:text-xl font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
                        {r.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it Works ── */}
        <section className="py-16 lg:py-24 xl:py-28" id="how-it-works">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 reveal">
              <Badge className="mb-3 lg:mb-4 bg-red-50 text-red-600 border-red-200 rounded-full text-xs lg:text-sm">
                Simple Process
              </Badge>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 lg:mb-4 text-gray-900 tracking-[-0.03em]"
                data-testid="text-how-it-works-title"
              >
                Get Started in 3 Steps
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500 max-w-xl lg:max-w-2xl mx-auto">
                From signup to AI visibility improvement in under 10 minutes
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 lg:gap-12 max-w-5xl xl:max-w-6xl mx-auto">
              {[
                {
                  n: "1",
                  title: "Connect Your Brand",
                  desc: "Add your brand details, website, and key products. We'll analyze your current AI visibility.",
                },
                {
                  n: "2",
                  title: "Generate Optimized Content",
                  desc: "Our AI creates citation-optimized articles and FAQs designed for AI search engines.",
                },
                {
                  n: "3",
                  title: "Track & Grow Citations",
                  desc: "Monitor your brand mentions across ChatGPT, Claude, Perplexity, and more in real-time.",
                },
              ].map((step, i) => (
                <div
                  key={step.n}
                  className="relative text-center reveal"
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <div className="w-14 h-14 lg:w-16 lg:h-16 xl:w-20 xl:h-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-4 lg:mb-6 text-xl lg:text-2xl xl:text-3xl font-bold text-white shadow-md shadow-red-200 hover:scale-110 hover:rotate-3 transition-transform duration-300">
                    {step.n}
                  </div>
                  <h3 className="text-base lg:text-lg xl:text-xl font-semibold mb-2 lg:mb-3 text-gray-900">
                    {step.title}
                  </h3>
                  <p className="text-sm lg:text-base text-gray-500 leading-relaxed">{step.desc}</p>
                  {i < 2 && (
                    <div className="hidden md:block absolute top-7 lg:top-8 left-[58%] w-[80%] h-px bg-gradient-to-r from-red-300 to-transparent" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Product Pillars ── */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 max-w-2xl lg:max-w-3xl mx-auto reveal">
              <div className="inline-flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5 mb-4 lg:mb-5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm lg:text-base text-gray-600">Product Pillars</span>
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 lg:mb-4 tracking-[-0.03em] text-gray-900">
                What Sets VentureCite Apart
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500">
                VentureCite goes beyond citation tracking — offering unmatched clarity, automation,
                and speed for modern teams.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {pillars.map((p, i) => (
                <div
                  key={p.num}
                  className="bg-[#f2f1ed] rounded-2xl lg:rounded-3xl p-6 lg:p-8 border border-gray-200/60 card-lift hover:border-red-200 hover:shadow-lg hover:shadow-red-100/30 reveal group"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <div className="inline-flex items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-white border border-gray-200/80 text-gray-400 font-medium text-sm mb-5 lg:mb-6 group-hover:bg-red-600 group-hover:text-white group-hover:border-red-600 transition-all duration-300">
                    {p.num}
                  </div>
                  <h3 className="text-base lg:text-lg xl:text-xl font-semibold mb-2 lg:mb-3 text-gray-900">
                    {p.title}
                  </h3>
                  <p className="text-sm lg:text-base text-gray-500 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Expert Quotes ── */}
        <section className="py-16 lg:py-24" id="expert-quotes">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 reveal">
              <Badge className="mb-3 lg:mb-4 bg-green-50 text-green-600 border-green-200 rounded-full text-xs lg:text-sm">
                Industry Insights
              </Badge>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 text-gray-900 tracking-[-0.03em]"
                data-testid="text-testimonials-title"
              >
                What Experts Say About GEO
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5 lg:gap-7">
              {testimonials.map((t, i) => (
                <Card
                  key={i}
                  className="bg-white border-gray-200/60 rounded-2xl lg:rounded-3xl card-lift hover:border-red-200 hover:shadow-lg hover:shadow-gray-200/50 reveal"
                  style={{ transitionDelay: `${i * 80}ms` }}
                  data-testid={`testimonial-card-${i}`}
                >
                  <CardContent className="p-6 lg:p-8">
                    <div className="flex gap-1 mb-3 lg:mb-4">
                      {[...Array(5)].map((_, k) => (
                        <Star
                          key={k}
                          className="w-4 h-4 lg:w-5 lg:h-5 fill-yellow-400 text-yellow-400"
                        />
                      ))}
                    </div>
                    <Quote className="w-7 h-7 lg:w-9 lg:h-9 text-red-200 mb-3" />
                    <p className="text-sm lg:text-base xl:text-lg text-gray-600 mb-5 lg:mb-6 leading-relaxed">
                      "{t.quote}"
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-sm lg:text-base font-medium text-white">
                        {t.avatar}
                      </div>
                      <div>
                        <div className="text-sm lg:text-base font-medium text-gray-900">
                          {t.author}
                        </div>
                        <div className="text-xs lg:text-sm text-gray-500">
                          {t.role}
                          {t.company ? `, ${t.company}` : ""}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── Comparison ── */}
        <section className="py-16 lg:py-24 bg-white" id="comparison">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 reveal">
              <Badge className="mb-3 lg:mb-4 bg-blue-50 text-blue-600 border-blue-200 rounded-full text-xs lg:text-sm">
                Why Choose Us
              </Badge>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 lg:mb-4 text-gray-900 tracking-[-0.03em]"
                data-testid="text-comparison-title"
              >
                VentureCite vs. The Competition
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500">
                See why leading brands choose VentureCite for AI search optimization
              </p>
            </div>

            <div className="max-w-4xl xl:max-w-5xl mx-auto bg-[#f2f1ed] rounded-2xl lg:rounded-3xl border border-gray-200/60 overflow-hidden shadow-sm reveal">
              <div className="overflow-x-auto">
                <table className="w-full text-sm lg:text-base">
                  <thead>
                    <tr className="border-b border-gray-200/60">
                      <th className="text-left py-4 lg:py-5 px-5 lg:px-7 text-gray-500 font-medium">
                        Feature
                      </th>
                      <th className="py-4 lg:py-5 px-5 lg:px-7 text-center">
                        <span className="inline-flex items-center gap-1.5 bg-red-50 px-3 py-1 rounded-full font-semibold text-red-600 text-xs lg:text-sm">
                          VentureCite
                        </span>
                      </th>
                      <th className="py-4 lg:py-5 px-5 lg:px-7 text-center text-gray-400 font-medium">
                        Searchable.ai
                      </th>
                      <th className="py-4 lg:py-5 px-5 lg:px-7 text-center text-gray-400 font-medium">
                        Traditional SEO
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feature: "AI Citation Tracking", us: true, comp1: true, comp2: false },
                      { feature: "Share of Answer Analysis", us: true, comp1: true, comp2: false },
                      { feature: "AI Content Generation", us: true, comp1: true, comp2: false },
                      {
                        feature: "Publication Outreach Automation",
                        us: true,
                        comp1: false,
                        comp2: false,
                      },
                      {
                        feature: "Honest GEO Signal Scoring",
                        us: true,
                        comp1: false,
                        comp2: false,
                      },
                      {
                        feature: "Intelligent FAQ Optimization",
                        us: true,
                        comp1: false,
                        comp2: false,
                      },
                      {
                        feature: "Starting Price",
                        us: "$79/mo",
                        comp1: "$125/mo",
                        comp2: "$3,000+/mo",
                      },
                    ].map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-200/60 last:border-0 hover:bg-white/60 transition-colors"
                      >
                        <td className="py-4 lg:py-5 px-5 lg:px-7 text-gray-700">{row.feature}</td>
                        <td className="py-4 lg:py-5 px-5 lg:px-7 text-center">
                          {typeof row.us === "boolean" ? (
                            row.us ? (
                              <Check className="w-5 h-5 lg:w-6 lg:h-6 text-emerald-600 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-red-600 font-semibold">{row.us}</span>
                          )}
                        </td>
                        <td className="py-4 lg:py-5 px-5 lg:px-7 text-center">
                          {typeof row.comp1 === "boolean" ? (
                            row.comp1 ? (
                              <Check className="w-5 h-5 lg:w-6 lg:h-6 text-gray-400 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-gray-500">{row.comp1}</span>
                          )}
                        </td>
                        <td className="py-4 lg:py-5 px-5 lg:px-7 text-center">
                          {typeof row.comp2 === "boolean" ? (
                            row.comp2 ? (
                              <Check className="w-5 h-5 lg:w-6 lg:h-6 text-gray-400 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 lg:w-6 lg:h-6 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-gray-500">{row.comp2}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="py-20 lg:py-28 xl:py-32">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 max-w-2xl lg:max-w-3xl mx-auto reveal">
              <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 mb-4 lg:mb-5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm lg:text-base text-gray-600">Pricing</span>
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 lg:mb-4 tracking-[-0.03em] text-gray-900">
                Build, automate, and scale your GEO
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500">
                Enterprise-level automation and workflows at a startup-friendly price.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 lg:gap-7 max-w-5xl xl:max-w-6xl mx-auto items-start">
              {pricing.map((plan, i) => (
                <div
                  key={plan.name}
                  className={`rounded-2xl lg:rounded-3xl p-6 lg:p-8 xl:p-10 border card-lift reveal ${
                    plan.featured
                      ? "bg-gradient-to-br from-red-50 to-rose-50 border-red-200 shadow-xl shadow-red-100/50 md:scale-[1.04]"
                      : "bg-white border-gray-200/60 hover:border-red-200"
                  }`}
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  {plan.featured && (
                    <div className="inline-block mb-3 lg:mb-4 bg-red-600 text-white text-xs lg:text-sm font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <h3
                    className={`text-lg lg:text-xl xl:text-2xl font-semibold mb-4 lg:mb-5 ${plan.featured ? "text-red-600" : "text-gray-900"}`}
                  >
                    {plan.name}
                  </h3>
                  <div className="mb-4 lg:mb-5">
                    <span className="text-4xl lg:text-5xl xl:text-6xl font-bold tracking-[-0.03em] text-gray-900">
                      {plan.price}
                    </span>
                    <span className="text-sm lg:text-base text-gray-400 ml-2">/mo</span>
                  </div>
                  <p className="text-sm lg:text-base text-gray-500 mb-6 lg:mb-8 leading-relaxed">
                    {plan.desc}
                  </p>
                  <Link href="/pricing">
                    <Button
                      className="w-full bg-red-600 hover:bg-red-700 text-white rounded-full h-11 lg:h-12 text-sm lg:text-base font-medium shadow-sm hover:shadow-md hover:shadow-red-200 hover:-translate-y-0.5 transition-all duration-200"
                      data-testid={`button-pricing-${plan.name.toLowerCase()}`}
                    >
                      Get Started
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ROI Calculator ── */}
        <section className="py-16 lg:py-24 bg-white" id="roi-calculator">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="max-w-4xl xl:max-w-5xl mx-auto">
              <div className="text-center mb-8 lg:mb-12 reveal">
                <Badge className="mb-3 lg:mb-4 bg-green-50 text-green-600 border-green-200 rounded-full text-xs lg:text-sm">
                  Calculate Your ROI
                </Badge>
                <h2
                  className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 lg:mb-4 text-gray-900 tracking-[-0.03em]"
                  data-testid="text-roi-title"
                >
                  What Could AI Visibility Be Worth?
                </h2>
                <p className="text-base lg:text-lg xl:text-xl text-gray-500">
                  Estimate your potential revenue from AI search citations
                </p>
              </div>

              <Card className="bg-[#f2f1ed] border-gray-200/60 rounded-2xl lg:rounded-3xl reveal">
                <CardContent className="p-6 lg:p-8 xl:p-10">
                  <div className="grid md:grid-cols-2 gap-6 lg:gap-10">
                    <div>
                      <label className="block text-sm lg:text-base font-medium text-gray-700 mb-3 lg:mb-4">
                        Your Monthly Website Traffic
                      </label>
                      <Slider
                        value={monthlyTraffic}
                        onValueChange={setMonthlyTraffic}
                        min={1000}
                        max={500000}
                        step={1000}
                        className="mb-3 lg:mb-4"
                        data-testid="slider-monthly-traffic"
                      />
                      <div className="text-xl lg:text-2xl xl:text-3xl font-bold text-red-600 tracking-tight">
                        {monthlyTraffic[0].toLocaleString()} visitors/month
                      </div>
                      <p className="text-xs lg:text-sm text-gray-400 mt-1 lg:mt-2">
                        Based on industry averages for AI citation conversion rates
                      </p>
                    </div>

                    <div className="space-y-3 lg:space-y-4">
                      {[
                        {
                          label: "Estimated Monthly AI Citations",
                          value: estimatedCitations.toLocaleString(),
                          color: "text-gray-900",
                        },
                        {
                          label: "Estimated Monthly Value",
                          value: `$${estimatedRevenue.toLocaleString()}`,
                          color: "text-emerald-600",
                        },
                        {
                          label: "Estimated Annual Value",
                          value: `$${annualValue.toLocaleString()}`,
                          color: "text-red-600",
                          highlight: true,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`rounded-xl lg:rounded-2xl p-4 lg:p-5 border hover:shadow-sm transition-shadow ${item.highlight ? "bg-red-50 border-red-200" : "bg-white border-gray-200/60"}`}
                        >
                          <div className="text-xs lg:text-sm text-gray-500 mb-1">{item.label}</div>
                          <div
                            className={`text-2xl lg:text-3xl xl:text-4xl font-bold ${item.color}`}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 lg:mt-8 text-center">
                    <a href="/register">
                      <Button
                        className="bg-red-600 text-white hover:bg-red-700 rounded-full h-12 lg:h-13 px-8 lg:px-10 text-sm lg:text-base shadow-sm hover:shadow-lg hover:shadow-red-200 hover:-translate-y-0.5 transition-all duration-200 group"
                        data-testid="button-roi-cta"
                      >
                        Start Capturing This Value
                        <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ── Benchmarks ── */}
        <section className="py-16 lg:py-24" id="benchmarks">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 reveal">
              <Badge className="mb-3 lg:mb-4 bg-orange-50 text-orange-600 border-orange-200 rounded-full text-xs lg:text-sm">
                Industry Benchmarks
              </Badge>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 text-gray-900 tracking-[-0.03em]"
                data-testid="text-benchmarks-title"
              >
                What Top Brands Achieve with GEO
              </h2>
              <p className="text-sm lg:text-base text-gray-400">
                Based on industry research and published case studies
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 lg:gap-7">
              {[
                {
                  category: "SaaS Companies",
                  industry: "Project Management & Productivity",
                  metric: "3-8x",
                  description: "Increase in AI mentions",
                  detail: "Brands optimizing for GEO see 300-800% growth in citations",
                  color: "from-red-500 to-red-600",
                  topBar: "bg-gradient-to-r from-red-500 to-red-600",
                },
                {
                  category: "E-commerce",
                  industry: "Consumer & Retail",
                  metric: "$50-150K",
                  description: "Annual AI-driven revenue",
                  detail: "Mid-market brands capturing AI recommendation traffic",
                  color: "from-green-500 to-emerald-500",
                  topBar: "bg-gradient-to-r from-green-500 to-emerald-500",
                },
                {
                  category: "B2B Platforms",
                  industry: "Marketing & Sales Technology",
                  metric: "15-25%",
                  description: "Share of Answer potential",
                  detail: "Category leaders in competitive 'best tool' queries",
                  color: "from-blue-500 to-cyan-500",
                  topBar: "bg-gradient-to-r from-blue-500 to-cyan-500",
                },
              ].map((study, i) => (
                <Card
                  key={i}
                  className="bg-white border-gray-200/60 rounded-2xl lg:rounded-3xl overflow-hidden card-lift hover:shadow-xl reveal"
                  style={{ transitionDelay: `${i * 80}ms` }}
                  data-testid={`benchmark-card-${i}`}
                >
                  <div className={`h-2 ${study.topBar}`} />
                  <CardContent className="p-5 lg:p-7">
                    <div className="text-xs lg:text-sm text-gray-400 mb-1">{study.industry}</div>
                    <div className="font-semibold text-gray-900 mb-3 lg:mb-4 text-sm lg:text-base">
                      {study.category}
                    </div>
                    <div
                      className={`text-4xl lg:text-5xl xl:text-6xl font-bold bg-gradient-to-r ${study.color} bg-clip-text text-transparent mb-2 tracking-[-0.03em]`}
                    >
                      {study.metric}
                    </div>
                    <div className="text-base lg:text-lg font-medium text-gray-900 mb-1 lg:mb-2">
                      {study.description}
                    </div>
                    <div className="text-xs lg:text-sm text-gray-500">{study.detail}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-16 lg:py-24 bg-white" id="faq">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="text-center mb-10 lg:mb-14 reveal">
              <Badge className="mb-3 lg:mb-4 bg-yellow-50 text-yellow-600 border-yellow-200 rounded-full text-xs lg:text-sm">
                Questions & Answers
              </Badge>
              <h2
                className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 text-gray-900 tracking-[-0.03em]"
                data-testid="text-faq-title"
              >
                Frequently Asked Questions
              </h2>
            </div>

            <div className="max-w-3xl xl:max-w-4xl mx-auto space-y-2 lg:space-y-3">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className="bg-[#f2f1ed] border border-gray-200/60 rounded-xl lg:rounded-2xl overflow-hidden reveal hover:shadow-sm transition-shadow"
                  style={{ transitionDelay: `${i * 40}ms` }}
                  data-testid={`faq-item-${i}`}
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 lg:p-5 xl:p-6 text-left hover:bg-gray-100/50 transition-colors"
                    data-testid={`button-faq-toggle-${i}`}
                  >
                    <span className="text-sm lg:text-base xl:text-lg font-medium text-gray-900 pr-4">
                      {faq.q}
                    </span>
                    {expandedFaq === i ? (
                      <ChevronUp className="w-5 h-5 text-red-600 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {expandedFaq === i && (
                    <div className="px-4 lg:px-5 xl:px-6 pb-4 lg:pb-5 text-sm lg:text-base text-gray-500 leading-relaxed animate-fade-in-up">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust badges ── */}
        <section className="py-10 lg:py-14 border-y border-gray-200/60">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <p className="text-center text-xs lg:text-sm text-gray-400 uppercase tracking-widest mb-6 lg:mb-8 reveal">
              Trusted & Secure
            </p>
            <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10 lg:gap-16 xl:gap-20">
              {[
                { icon: Shield, color: "text-green-600", label: "SOC 2 Compliant" },
                { icon: Lock, color: "text-blue-600", label: "256-bit Encryption" },
                { icon: SiStripe, color: "text-indigo-600", label: "Secure Payments" },
                { icon: SiOpenai, color: "text-gray-900", label: "OpenAI Partner" },
                { icon: Award, color: "text-yellow-600", label: "GDPR Compliant" },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-sm lg:text-base text-gray-500 reveal hover:text-gray-900 transition-colors cursor-default"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <item.icon className={`w-5 h-5 lg:w-6 lg:h-6 ${item.color}`} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Lead Magnet ── */}
        <section className="py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <Card className="max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto bg-gradient-to-br from-red-50 via-rose-50 to-orange-50 border-red-200 rounded-2xl lg:rounded-3xl reveal hover:shadow-lg hover:shadow-red-100/40 transition-shadow duration-300">
              <CardContent className="p-8 lg:p-10 xl:p-14 text-center">
                <Badge className="mb-3 lg:mb-4 bg-red-100 text-red-700 border-red-300 rounded-full text-xs lg:text-sm">
                  Free Resource
                </Badge>
                <h3 className="text-2xl lg:text-3xl xl:text-4xl font-bold mb-3 lg:mb-4 text-gray-900 tracking-[-0.02em]">
                  Get Our GEO Strategy Guide
                </h3>
                <p className="text-sm lg:text-base xl:text-lg text-gray-500 mb-6 lg:mb-8 max-w-lg lg:max-w-xl mx-auto leading-relaxed">
                  Learn the 7 tactics top brands use to dominate AI search results. Includes case
                  studies, templates, and a GEO audit checklist.
                </p>

                {leadSubmitted ? (
                  <div
                    className="flex items-center justify-center gap-2 text-green-600 animate-fade-in-up"
                    data-testid="text-email-success"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm lg:text-base">
                      Check your inbox! Guide is on its way.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3 max-w-sm lg:max-w-md mx-auto">
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 rounded-full h-11 lg:h-12 px-5 focus-visible:ring-red-500 text-sm lg:text-base"
                      data-testid="input-lead-email"
                    />
                    <Button
                      onClick={() => setLeadSubmitted(true)}
                      className="bg-red-600 text-white hover:bg-red-700 rounded-full h-11 lg:h-12 px-5 lg:px-6 whitespace-nowrap hover:shadow-md hover:shadow-red-200 hover:-translate-y-0.5 transition-all duration-200 text-sm lg:text-base"
                      data-testid="button-lead-submit"
                    >
                      <Mail className="w-4 h-4 mr-1.5" />
                      Get Free Guide
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-20 lg:py-28 xl:py-32 border-t border-gray-200/60">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto text-center reveal">
              <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-1.5 mb-6 lg:mb-8 shadow-sm">
                <Shield className="w-4 h-4 text-green-600" />
                <span className="text-sm lg:text-base text-gray-600">
                  Enterprise-grade security
                </span>
              </div>

              <h2 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-5 lg:mb-6 text-gray-900 tracking-[-0.04em] leading-[1.06]">
                Ready to dominate <span className="text-gradient-red">AI search?</span>
              </h2>
              <p className="text-base lg:text-lg xl:text-xl text-gray-500 mb-8 lg:mb-10">
                Join leading brands already optimizing for the AI-first future.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 justify-center">
                <a href="/register">
                  <Button
                    className="bg-red-600 text-white hover:bg-red-700 rounded-full h-12 lg:h-14 px-8 lg:px-10 text-sm lg:text-base font-medium shadow-sm hover:shadow-xl hover:shadow-red-300/40 hover:-translate-y-0.5 transition-all duration-300 group"
                    data-testid="button-cta-start"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 w-4 h-4 lg:w-5 lg:h-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </a>
                <Link href="/pricing">
                  <Button
                    variant="outline"
                    className="bg-white border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300 rounded-full h-12 lg:h-14 px-8 lg:px-10 text-sm lg:text-base hover:-translate-y-0.5 transition-all duration-300"
                    data-testid="button-cta-pricing"
                  >
                    See Plans
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="pt-12 lg:pt-16 pb-8 lg:pb-10 border-t border-gray-200/60 bg-white">
          <div className="max-w-7xl mx-auto px-6 xl:px-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 lg:gap-8 mb-8 lg:mb-10">
              <Link href="/" className="flex items-center gap-2 group">
                <img
                  src={logoPath}
                  alt="VentureCite"
                  className="h-10 lg:h-12 w-auto transition-transform duration-300 group-hover:scale-105"
                />
              </Link>

              <div className="flex items-center gap-2 lg:gap-3">
                {[
                  { Icon: Instagram, label: "Instagram" },
                  { Icon: Linkedin, label: "LinkedIn" },
                  { Icon: Youtube, label: "YouTube" },
                  { Icon: Twitter, label: "Twitter" },
                ].map(({ Icon, label }) => (
                  <a
                    key={label}
                    href="#"
                    aria-label={label}
                    className="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 hover:border-red-600 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
                  </a>
                ))}
              </div>
            </div>

            <div className="pt-6 lg:pt-8 border-t border-gray-200/60 flex flex-col md:flex-row justify-between items-center gap-4 text-xs lg:text-sm text-gray-400">
              <div className="flex flex-wrap gap-5 lg:gap-7">
                {[
                  { href: "#about", label: "About" },
                  { href: "#features", label: "Features" },
                  { href: "#pricing", label: "Pricing" },
                  { href: "#faq", label: "FAQ" },
                ].map((l) => (
                  <a key={l.href} href={l.href} className="hover:text-red-600 transition-colors">
                    {l.label}
                  </a>
                ))}
              </div>
              <div className="flex flex-wrap gap-5 lg:gap-7">
                <a href="#" className="hover:text-red-600 transition-colors">
                  Terms & Conditions
                </a>
                <Link href="/privacy" className="hover:text-red-600 transition-colors">
                  Privacy Policy
                </Link>
                <span>© 2026 VentureCite</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
