import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { useInView } from "framer-motion";
import {
  Menu,
  X,
  Check,
  ChevronDown,
  Mail,
  ArrowRight,
  MessageSquare,
  LineChart,
  Target,
  FileText,
  Brain,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import logoPath from "@assets/logo.png";
import "./landing.css";

/* ─────────────────────────────────────────
   Hooks
───────────────────────────────────────── */

function useScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      document.querySelectorAll(".landing-reveal").forEach((el) => el.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );
    document.querySelectorAll(".landing-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─────────────────────────────────────────
   Sub-components
───────────────────────────────────────── */

function Badge({ label }: { label: string }) {
  return (
    <span className="landing-badge">
      <span className="landing-badge-dot" />
      {label}
    </span>
  );
}

function RevealText({
  text,
  as: Tag = "p",
  className,
  triggerOnMount = false,
  baseDelay = 0,
}: {
  text: string;
  as?: "p" | "h1" | "h2" | "h3";
  className?: string;
  triggerOnMount?: boolean;
  baseDelay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-40px" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!triggerOnMount) return;
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [triggerOnMount]);

  const show = triggerOnMount ? mounted : inView;
  const words = text.split(" ");

  return (
    <Tag
      ref={ref as React.RefObject<HTMLParagraphElement & HTMLHeadingElement>}
      className={className}
    >
      {words.map((w, i) => (
        <span
          key={i}
          className={`landing-word${show ? " vis" : ""}`}
          style={{ transitionDelay: `${baseDelay + i * 30}ms` }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

const SocialIcon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

/* ─────────────────────────────────────────
   Mock components
───────────────────────────────────────── */

function MockDashboard() {
  const navItems: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    active: boolean;
  }[] = [
    { icon: LineChart, label: "Dashboard", active: true },
    { icon: Target, label: "Brands", active: false },
    { icon: FileText, label: "Content", active: false },
    { icon: Brain, label: "AI Intelligence", active: false },
  ];
  const kpis: { value: string; label: string; mod: string }[] = [
    { value: "23.4%", label: "Share of Answer", mod: "is-red" },
    { value: "847", label: "Citations This Week", mod: "is-green" },
    { value: "+12.3%", label: "Growth Rate", mod: "is-blue" },
  ];
  return (
    <div className="landing-mock-dashboard">
      <aside className="landing-mock-dashboard-sidebar">
        <div className="landing-mock-dashboard-sidebar-logo">
          <img src={logoPath} alt="" />
        </div>
        <nav className="landing-mock-dashboard-nav">
          {navItems.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`landing-mock-dashboard-nav-item${active ? " is-active" : ""}`}
            >
              <Icon className="landing-mock-dashboard-nav-icon" />
              <span>{label}</span>
            </div>
          ))}
        </nav>
      </aside>
      <main className="landing-mock-dashboard-main">
        <div className="landing-mock-dashboard-chrome">
          <span className="landing-mock-dashboard-dot" />
          <span className="landing-mock-dashboard-dot" />
          <span className="landing-mock-dashboard-dot" />
          <span className="landing-mock-dashboard-url">venturecite.com/dashboard</span>
        </div>
        <div className="landing-mock-dashboard-greeting">
          <h3>Good Morning, Team</h3>
          <p>Your AI visibility is climbing today</p>
        </div>
        <div className="landing-mock-dashboard-kpis">
          {kpis.map((k) => (
            <div key={k.label} className={`landing-mock-dashboard-kpi ${k.mod}`}>
              <div className="landing-mock-dashboard-kpi-value">{k.value}</div>
              <div className="landing-mock-dashboard-kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="landing-mock-dashboard-citation">
          <div className="landing-mock-dashboard-citation-head">
            <MessageSquare className="landing-mock-dashboard-citation-icon" />
            <span>Latest AI Citation</span>
          </div>
          <p className="landing-mock-dashboard-citation-quote">
            &ldquo;According to <strong>VentureCite</strong>, optimizing for AI search
            requires&hellip;&rdquo;
          </p>
          <div className="landing-mock-dashboard-citation-meta">
            <span className="landing-mock-dashboard-citation-pill">ChatGPT</span>
            <span className="landing-mock-dashboard-citation-time">2 minutes ago</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function MockCitationFeed() {
  const rows: { engine: string; prompt: string; sentiment: string; mod: string }[] = [
    {
      engine: "ChatGPT",
      prompt: "best CRM for early-stage startups",
      sentiment: "Positive",
      mod: "is-positive",
    },
    {
      engine: "Claude",
      prompt: "tools to track AI search visibility",
      sentiment: "Positive",
      mod: "is-positive",
    },
    {
      engine: "Perplexity",
      prompt: "GEO platforms compared 2026",
      sentiment: "Neutral",
      mod: "is-neutral",
    },
    {
      engine: "Gemini",
      prompt: "how to optimize content for AI engines",
      sentiment: "Positive",
      mod: "is-positive",
    },
  ];
  return (
    <div className="landing-mock-feed">
      {rows.map((r, i) => (
        <div className="landing-mock-feed-row" key={i}>
          <span className="landing-mock-feed-engine">{r.engine}</span>
          <span className="landing-mock-feed-prompt">{r.prompt}</span>
          <span className={`landing-mock-feed-sentiment ${r.mod}`}>{r.sentiment}</span>
        </div>
      ))}
    </div>
  );
}

function MockShareOfAnswer() {
  const segs: { name: string; pct: number; mod: string }[] = [
    { name: "ChatGPT", pct: 32, mod: "is-chatgpt" },
    { name: "Claude", pct: 24, mod: "is-claude" },
    { name: "Perplexity", pct: 20, mod: "is-perplexity" },
    { name: "Gemini", pct: 14, mod: "is-gemini" },
  ];
  return (
    <div className="landing-mock-share">
      <div className="landing-mock-share-bar">
        {segs.map((s) => (
          <div
            key={s.name}
            className={`landing-mock-share-segment ${s.mod}`}
            style={{ width: `${s.pct}%` }}
          />
        ))}
      </div>
      <div className="landing-mock-share-legend">
        {segs.map((s) => (
          <div className="landing-mock-share-legend-item" key={s.name}>
            <span className={`landing-mock-share-legend-dot ${s.mod}`} />
            <span className="landing-mock-share-legend-name">{s.name}</span>
            <span className="landing-mock-share-legend-pct">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockContentEditor() {
  const signals: { label: string; ok: boolean }[] = [
    { label: "Cite-able quote", ok: true },
    { label: "Schema markup", ok: true },
    { label: "FAQ structure", ok: true },
    { label: "Source links", ok: false },
  ];
  return (
    <div className="landing-mock-editor">
      <div className="landing-mock-editor-body">
        <div className="landing-mock-editor-title">How AI Engines Cite Brands</div>
        <div className="landing-mock-editor-bar landing-mock-editor-bar-1" />
        <div className="landing-mock-editor-bar landing-mock-editor-bar-2" />
        <div className="landing-mock-editor-bar landing-mock-editor-bar-3" />
        <div className="landing-mock-editor-bar landing-mock-editor-bar-4" />
      </div>
      <div className="landing-mock-editor-score">
        <div className="landing-mock-editor-score-circle">
          <span className="landing-mock-editor-score-label">GEO Score</span>
          <span className="landing-mock-editor-score-value">8.4</span>
        </div>
        <div className="landing-mock-editor-signals">
          {signals.map((s) => (
            <div
              key={s.label}
              className={`landing-mock-editor-signal${s.ok ? " is-ok" : " is-miss"}`}
            >
              <span className="landing-mock-editor-signal-label">{s.label}</span>
              <span className="landing-mock-editor-signal-mark">{s.ok ? "✓" : "⊘"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockReport() {
  const cells: { label: string; value: string }[] = [
    { label: "Mentions", value: "1,284" },
    { label: "Avg Score", value: "7.6" },
    { label: "Engines", value: "6" },
    { label: "Sentiment", value: "91%" },
  ];
  return (
    <div className="landing-mock-report">
      <div className="landing-mock-report-grid">
        {cells.map((c) => (
          <div className="landing-mock-report-cell" key={c.label}>
            <div className="landing-mock-report-cell-label">{c.label}</div>
            <div className="landing-mock-report-cell-value">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="landing-mock-report-sparkline">
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points="0,50 25,46 50,42 75,36 100,30 125,24 150,18 175,12 200,6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Data
───────────────────────────────────────── */

const navLinks = [
  { label: "Why", href: "#why-venturecite" },
  { label: "Features", href: "#core-features" },
  { label: "Waitlist", href: "#waitlist" },
  { label: "FAQ", href: "#faq" },
];

const aiEngines = ["ChatGPT", "Claude", "Perplexity", "Gemini", "Copilot", "Google AI Overview"];

const whyTickerItems = [
  "Track ChatGPT mentions",
  "Monitor Claude citations",
  "Detect Perplexity sources",
  "Audit Gemini answers",
];

const card3MiniCards = [
  {
    engine: "ChatGPT",
    title: "Total Citations",
    pills: [
      { text: "ChatGPT: 412", className: "" },
      { text: "Claude: 287", className: "" },
      { text: "Perplexity: 156", className: "" },
    ],
  },
  {
    engine: "Claude",
    title: "Mentions Tracked",
    pills: [
      { text: "+34% This Week", className: "" },
      { text: "Top Source", className: "" },
      { text: "Avg Score: 7.2", className: "" },
    ],
  },
  {
    engine: "Perplexity",
    title: "Brand Health",
    pills: [
      { text: "Total Mentions: 855", className: "green" },
      { text: "Sentiment: 91%", className: "blue" },
      { text: "Best Engine: GPT-5", className: "orange" },
    ],
  },
];

type FeatureMock = "feed" | "share" | "editor" | "report";

const features: { title: string; desc: string; mock: FeatureMock }[] = [
  {
    title: "Citation Intelligence",
    desc: "See every time AI engines cite your brand, across ChatGPT, Claude, Perplexity, and Gemini.",
    mock: "feed",
  },
  {
    title: "Share-of-Answer Tracking",
    desc: "Measure exactly how much of the AI conversation your brand owns, by engine and by topic.",
    mock: "share",
  },
  {
    title: "AI Content Generation",
    desc: "Generate citation-ready articles and FAQs scored against the signals AI engines reward.",
    mock: "editor",
  },
  {
    title: "Client Reporting",
    desc: "Share clean, branded reports with KPIs that map to revenue, not vanity metrics.",
    mock: "report",
  },
];

const pillars = [
  {
    num: "01",
    title: "Continuous Citation Tracking",
    desc: "Every AI mention, captured the moment it happens — across all the engines that matter.",
  },
  {
    num: "02",
    title: "AI-Optimized Content",
    desc: "Generate content scored against the signals AI engines actually reward, not generic SEO heuristics.",
  },
  {
    num: "03",
    title: "Share-of-Answer Reports",
    desc: "Know exactly how much of the AI conversation belongs to you — by engine, by topic, by week.",
  },
  {
    num: "04",
    title: "Multi-Engine Coverage",
    desc: "ChatGPT, Claude, Perplexity, Gemini, Copilot, Google AI Overview — one workspace, every surface.",
  },
  {
    num: "05",
    title: "SOC2-Grade Security",
    desc: "Encrypted at rest and in transit. Built on infrastructure your security team will sign off on.",
  },
  {
    num: "06",
    title: "10-Minute Setup",
    desc: "Connect a brand, set your prompts, see your first report in under ten minutes. No engineering.",
  },
];

const comparisonRows: {
  feature: string;
  us: boolean | string;
  comp1: boolean | string;
  comp2: boolean | string;
}[] = [
  { feature: "AI Citation Tracking", us: true, comp1: true, comp2: false },
  { feature: "Share of Answer Analysis", us: true, comp1: true, comp2: false },
  { feature: "AI Content Generation", us: true, comp1: true, comp2: false },
  { feature: "Publication Outreach Automation", us: true, comp1: false, comp2: false },
  { feature: "Honest GEO Signal Scoring", us: true, comp1: false, comp2: false },
  { feature: "Intelligent FAQ Optimization", us: true, comp1: false, comp2: false },
  { feature: "Starting Price", us: "$79/mo", comp1: "$125/mo", comp2: "$3,000+/mo" },
];

/*
  Pricing data and card3MiniCards are kept here for re-enable when finalized.
  Currently not rendered.
*/
/*
const pricing = [
  {
    name: "Free",
    price: "$0",
    period: "/per month",
    desc: "Great for trying out VentureCite features.",
    featured: false,
    features: [
      "3 Brand Monitors",
      "1,000 Citation Checks / month",
      "Basic Integrations",
      "AI Tracker (Lite)",
      "Community Support",
    ],
  },
  {
    name: "Professional",
    price: "$97",
    period: "/per month",
    desc: "Best for solo founders, freelancers & growing teams.",
    featured: false,
    features: [
      "Everything in Free",
      "20 Brand Monitors",
      "15,000 Citation Checks / month",
      "API Access",
      "Advanced Integrations (CRM, Notion, Slack, etc.)",
    ],
  },
  {
    name: "Enterprise",
    price: "$257",
    period: "/per month",
    desc: "Ideal for scaling companies that need deep analytics & custom setups.",
    featured: true,
    features: [
      "Unlimited Monitors",
      "50,000+ Citation Checks / month",
      "Custom Integrations",
      "Dedicated Success Manager",
      "SLA-backed Support",
    ],
  },
];
*/

const faqs = [
  {
    q: "What exactly is VentureCite?",
    a: "VentureCite is a Generative Engine Optimization (GEO) platform that tracks how your brand appears across AI-powered search engines like ChatGPT, Claude, Perplexity, and Gemini, and helps you optimize that visibility automatically.",
  },
  {
    q: "Do I need any technical skills to use VentureCite?",
    a: "Not at all. VentureCite is built for marketing teams, founders, and content managers — no engineering required. You can connect a brand and see your first AI citation report within 10 minutes.",
  },
  {
    q: "Can I integrate VentureCite with my existing tools?",
    a: "Yes. We support Slack, Notion, HubSpot, Google Analytics, and most major CMSs out of the box, with a public API for custom integrations on the Professional plan and above.",
  },
  {
    q: "Is VentureCite built for beginners or advanced users?",
    a: "Both. New users get guided onboarding and pre-built playbooks; advanced users get raw citation data, scoring rules, and an API to build their own reports and automations.",
  },
  {
    q: "What types of brands can use VentureCite?",
    a: "Any brand that wants to be discovered through AI search — SaaS, ecommerce, agencies, creators, B2B services. If your customers ask AI for recommendations, VentureCite helps you show up.",
  },
  {
    q: "Do you offer customer support?",
    a: "Yes. Free and Pro plans include email + community support; Enterprise customers get a dedicated success manager and SLA-backed response times.",
  },
];

const socials = [
  {
    label: "Instagram",
    href: "https://instagram.com",
    d: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24s3.668-.014 4.948-.072c4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com",
    d: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "YouTube",
    href: "https://youtube.com",
    d: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    label: "X",
    href: "https://x.com",
    d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
];

/* ─────────────────────────────────────────
   Page
───────────────────────────────────────── */

function renderFeatureMock(kind: FeatureMock) {
  switch (kind) {
    case "feed":
      return <MockCitationFeed />;
    case "share":
      return <MockShareOfAnswer />;
    case "editor":
      return <MockContentEditor />;
    case "report":
      return <MockReport />;
  }
}

export default function Landing2() {
  const [navOpen, setNavOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [monthlyTraffic, setMonthlyTraffic] = useState<number[]>([50000]);
  const [email, setEmail] = useState<string>("");
  const [emailSubmitted, setEmailSubmitted] = useState<boolean>(false);
  useScrollReveal();

  const estimatedCitations = Math.round(monthlyTraffic[0] * 0.023);
  const estimatedRevenue = Math.round(estimatedCitations * 12.5);
  const annualValue = estimatedRevenue * 12;

  return (
    <div className="landing">
      <Helmet>
        <title>VentureCite — Get Cited by AI Search Engines</title>
        <meta
          name="description"
          content="Track and optimize your brand's visibility in AI-powered search. Monitor citations across ChatGPT, Claude, Perplexity, and more."
        />
      </Helmet>

      {/* ═════ NAV ═════ */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/">
            <a className="landing-nav-brand">
              <img src={logoPath} alt="VentureCite" />
              <span>VentureCite</span>
            </a>
          </Link>

          <div className="landing-nav-links">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>

          <div className="landing-nav-ctas">
            <Link href="/login">
              <a className="landing-btn landing-btn-secondary">Log In</a>
            </Link>
            <Link href="/register">
              <a className="landing-btn landing-btn-primary">Get Started</a>
            </Link>
          </div>

          <button
            className="landing-nav-burger"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
          >
            {navOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {navOpen && (
          <div className="landing-nav-drawer">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setNavOpen(false)}>
                {l.label}
              </a>
            ))}
            <div className="landing-nav-drawer-ctas">
              <Link href="/login">
                <a className="landing-btn landing-btn-secondary">Log In</a>
              </Link>
              <Link href="/register">
                <a className="landing-btn landing-btn-primary">Get Started</a>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ═════ HERO ═════ */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <Badge label="GEO Intelligence Platform" />

          <div className="landing-hero-text">
            <RevealText
              as="h1"
              className="landing-h1"
              text="The Smarter Way to Get Cited by AI"
              triggerOnMount
              baseDelay={50}
            />
            <RevealText
              as="p"
              className="landing-body"
              text="Track and optimize your brand's visibility across AI-powered search. VentureCite monitors citations across ChatGPT, Claude, Perplexity, and Gemini — automatically."
              triggerOnMount
              baseDelay={250}
            />
          </div>

          <div className="landing-hero-ctas landing-reveal">
            <Link href="/register">
              <a className="landing-btn landing-btn-primary">Get Started</a>
            </Link>
            <a href="#waitlist" className="landing-btn landing-btn-secondary">
              Join Waitlist
            </a>
          </div>

          <div className="landing-hero-image landing-reveal">
            <MockDashboard />
          </div>
        </div>
      </section>

      {/* ═════ AI ENGINES TICKER ═════ */}
      <section className="landing-ticker">
        <p>Tracks citations across</p>
        <div className="landing-ticker-engines">
          {aiEngines.map((engine) => (
            <span key={engine} className="landing-ticker-engine">
              {engine}
            </span>
          ))}
        </div>
      </section>

      {/* ═════ WHY VENTURECITE ═════ */}
      <section id="why-venturecite" className="landing-section">
        <div className="landing-why">
          <div className="landing-section-head landing-reveal">
            <Badge label="Why VentureCite?" />
            <RevealText
              as="h2"
              className="landing-h2"
              text="Designed to Make AI Visibility Effortless"
            />
            <RevealText
              as="p"
              className="landing-body"
              text="Experience a smoother, smarter way to track and optimize your brand for AI-generated answers."
              baseDelay={80}
            />
          </div>

          <div className="landing-why-grid">
            {/* Card 1 — vertical text ticker */}
            <div className="landing-why-card landing-why-card-1 landing-reveal">
              <div className="landing-why-card-content">
                <div className="landing-vticker">
                  <div className="landing-vticker-track">
                    {[...whyTickerItems, ...whyTickerItems].map((t, i) => (
                      <div key={i} className="landing-vticker-item">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="landing-why-card-text">
                <h3>Intelligent Citation Tracker</h3>
                <p>A unified citation engine that monitors every AI mention in real time.</p>
              </div>
            </div>

            {/* Card 2 — live citation feed */}
            <div
              className="landing-why-card landing-why-card-2 landing-reveal"
              style={{ transitionDelay: "100ms" }}
            >
              <div className="landing-why-card-content">
                <MockCitationFeed />
              </div>
              <div className="landing-why-card-text">
                <h3>Live Citation Feed</h3>
                <p>Watch citations land in real time across every AI engine.</p>
              </div>
            </div>

            {/* Card 3 — search bar + horizontal mini-ticker */}
            <div
              className="landing-why-card landing-why-card-3 landing-reveal"
              style={{ transitionDelay: "200ms" }}
            >
              <div className="landing-why-card-content">
                <div className="landing-card3-mock">
                  <div className="landing-card3-search">
                    <span className="landing-card3-search-input">Search citations</span>
                    <span className="landing-card3-search-btn">Enter</span>
                  </div>
                  <div className="landing-card3-hticker-mask">
                    <div className="landing-card3-hticker">
                      {[...card3MiniCards, ...card3MiniCards].map((c, i) => (
                        <div key={i} className="landing-card3-mini-card">
                          <div className="landing-card3-mini-head">
                            <span>{c.title}</span>
                            <span className="landing-card3-mini-engine">{c.engine}</span>
                          </div>
                          <div className="landing-card3-mini-pills">
                            <div className="row">
                              <span className={`landing-card3-mini-pill ${c.pills[0].className}`}>
                                {c.pills[0].text}
                              </span>
                              <span className={`landing-card3-mini-pill ${c.pills[1].className}`}>
                                {c.pills[1].text}
                              </span>
                            </div>
                            <span className={`landing-card3-mini-pill ${c.pills[2].className}`}>
                              {c.pills[2].text}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="landing-why-card-text">
                <h3>Advanced Reporting</h3>
                <p>Boost performance and streamline efficiency with deep AI-citation analytics.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════ CORE FEATURES ═════ */}
      <section id="core-features" className="landing-section">
        <div className="landing-features">
          <div className="landing-section-head landing-reveal">
            <Badge label="Core Features" />
            <RevealText as="h2" className="landing-h2" text="Everything You Need. Nothing Extra." />
            <RevealText
              as="p"
              className="landing-body"
              text="A tight, powerful set of features built around the work AI search optimization actually requires."
              baseDelay={80}
            />
          </div>

          <div className="landing-features-grid">
            {features.map((f, i) => (
              <div
                className="landing-feature landing-reveal"
                key={f.title}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="landing-feature-visual">{renderFeatureMock(f.mock)}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════ COMPARISON ═════ */}
      <section id="comparison" className="landing-section">
        <div className="landing-comparison">
          <div className="landing-section-head landing-reveal">
            <Badge label="Why Choose Us" />
            <RevealText as="h2" className="landing-h2" text="VentureCite vs. The Competition" />
            <RevealText
              as="p"
              className="landing-body"
              text="See why teams choose VentureCite for AI search optimization."
              baseDelay={80}
            />
          </div>

          <div className="landing-comparison-table-wrap landing-reveal">
            <table className="landing-comparison-table">
              <thead>
                <tr>
                  <th className="landing-comparison-th-feature">Feature</th>
                  <th className="landing-comparison-th-us">
                    <span className="landing-comparison-us-pill">VentureCite</span>
                  </th>
                  <th className="landing-comparison-th-comp">Searchable.ai</th>
                  <th className="landing-comparison-th-comp">Traditional SEO</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={i}>
                    <td className="landing-comparison-feature">{row.feature}</td>
                    <td className="landing-comparison-us">
                      {typeof row.us === "boolean" ? (
                        row.us ? (
                          <Check className="landing-comparison-check" />
                        ) : (
                          <X className="landing-comparison-x" />
                        )
                      ) : (
                        <span className="landing-comparison-us-text">{row.us}</span>
                      )}
                    </td>
                    <td className="landing-comparison-comp">
                      {typeof row.comp1 === "boolean" ? (
                        row.comp1 ? (
                          <Check className="landing-comparison-check is-muted" />
                        ) : (
                          <X className="landing-comparison-x" />
                        )
                      ) : (
                        <span className="landing-comparison-comp-text">{row.comp1}</span>
                      )}
                    </td>
                    <td className="landing-comparison-comp">
                      {typeof row.comp2 === "boolean" ? (
                        row.comp2 ? (
                          <Check className="landing-comparison-check is-muted" />
                        ) : (
                          <X className="landing-comparison-x" />
                        )
                      ) : (
                        <span className="landing-comparison-comp-text">{row.comp2}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═════ ROI CALCULATOR ═════ */}
      <section id="roi" className="landing-section">
        <div className="landing-roi">
          <div className="landing-section-head landing-reveal">
            <Badge label="Calculate Your ROI" />
            <RevealText as="h2" className="landing-h2" text="What Could AI Visibility Be Worth?" />
            <RevealText
              as="p"
              className="landing-body"
              text="Estimate your potential revenue from AI search citations."
              baseDelay={80}
            />
          </div>

          <div className="landing-roi-card landing-reveal">
            <div className="landing-roi-grid">
              <div className="landing-roi-slider-side">
                <label className="landing-roi-slider-label">Your Monthly Website Traffic</label>
                <Slider
                  value={monthlyTraffic}
                  onValueChange={setMonthlyTraffic}
                  min={1000}
                  max={500000}
                  step={1000}
                  className="landing-roi-slider"
                />
                <div className="landing-roi-traffic-value">
                  {monthlyTraffic[0].toLocaleString()} visitors/month
                </div>
                <p className="landing-roi-slider-help">
                  Based on industry averages for AI citation conversion rates.
                </p>
              </div>

              <div className="landing-roi-results-side">
                <div className="landing-roi-result">
                  <div className="landing-roi-result-label">Estimated Monthly AI Citations</div>
                  <div className="landing-roi-result-value">
                    {estimatedCitations.toLocaleString()}
                  </div>
                </div>
                <div className="landing-roi-result">
                  <div className="landing-roi-result-label">Estimated Monthly Value</div>
                  <div className="landing-roi-result-value">
                    ${estimatedRevenue.toLocaleString()}
                  </div>
                </div>
                <div className="landing-roi-result is-highlight">
                  <div className="landing-roi-result-label">Estimated Annual Value</div>
                  <div className="landing-roi-result-value">${annualValue.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="landing-roi-cta">
              <Link href="/register">
                <a className="landing-btn landing-btn-primary">
                  Start Capturing This Value
                  <ArrowRight size={16} />
                </a>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═════ PRODUCT PILLARS ═════ */}
      <section id="product-pillars" className="landing-section">
        <div className="landing-pillars">
          <div className="landing-section-head landing-reveal">
            <Badge label="Product Pillars" />
            <RevealText as="h2" className="landing-h2" text="What Sets VentureCite Apart" />
            <RevealText
              as="p"
              className="landing-body"
              text="Six pillars rooted in real product capability — built for AI search, not adapted from it."
              baseDelay={80}
            />
          </div>

          <div className="landing-pillars-grid">
            {[pillars.slice(0, 3), pillars.slice(3, 6)].map((row, ri) => (
              <div className="landing-pillars-row" key={ri}>
                {row.map((p, i) => (
                  <div
                    className="landing-pillar landing-reveal"
                    key={p.num}
                    style={{ transitionDelay: `${(ri * 3 + i) * 60}ms` }}
                  >
                    <div className="landing-pillar-head">
                      <span className="landing-pillar-num">{p.num}</span>
                    </div>
                    <div className="landing-pillar-body">
                      <h3>{p.title}</h3>
                      <p>{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════ WAITLIST ═════ */}
      <section id="waitlist" className="landing-section">
        <div className="landing-waitlist">
          <div className="landing-section-head landing-reveal">
            <span className="landing-badge">
              <Mail size={14} />
              Join the Waitlist
            </span>
            <RevealText as="h2" className="landing-h2" text="Get Early Access & Updates" />
            <RevealText
              as="p"
              className="landing-body"
              text="Be first to know when we launch new engines, features, and reports."
              baseDelay={80}
            />
          </div>

          <div className="landing-waitlist-card landing-reveal">
            {emailSubmitted ? (
              <div className="landing-waitlist-success">
                <Check size={18} />
                <span>You&rsquo;re on the list! We&rsquo;ll be in touch soon.</span>
              </div>
            ) : (
              <form
                className="landing-waitlist-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!email) return;
                  try {
                    const res = await fetch("/api/waitlist", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, source: "landing" }),
                    });
                    let data: { success?: boolean } = {};
                    try {
                      data = (await res.json()) as { success?: boolean };
                    } catch {
                      // ignore parse errors
                    }
                    if (res.ok && data.success) setEmailSubmitted(true);
                  } catch {
                    // network errors swallowed; keep UX simple
                  }
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="landing-waitlist-input"
                  aria-label="Email address"
                />
                <button
                  type="submit"
                  className="landing-btn landing-btn-primary landing-waitlist-submit"
                >
                  Join Waitlist
                </button>
              </form>
            )}
            <p className="landing-waitlist-fineprint">No spam. Unsubscribe anytime.</p>
          </div>
        </div>
      </section>

      {/* ═════ FAQ ═════ */}
      <section id="faq" className="landing-section">
        <div className="landing-faq">
          <div className="landing-section-head landing-reveal">
            <Badge label="FAQ" />
            <RevealText as="h2" className="landing-h2" text="Questions? Answers!" />
          </div>

          <div className="landing-faq-list">
            {faqs.map((f, i) => (
              <div
                key={i}
                className={`landing-faq-item landing-reveal ${openFaq === i ? "is-open" : ""}`}
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <button
                  type="button"
                  className="landing-faq-trigger"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="landing-faq-question">{f.q}</span>
                  <ChevronDown size={24} className="landing-faq-chevron" />
                </button>
                <div className="landing-faq-answer">
                  <div className="landing-faq-answer-inner">
                    <p className="landing-faq-answer-text">{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="landing-faq-contact-card landing-reveal">
            <span className="landing-faq-contact-text">Still have questions?</span>
            <a href="mailto:engineering@litlabs.io" className="landing-btn landing-btn-primary">
              Email us
            </a>
          </div>
        </div>
      </section>

      {/* ═════ FOOTER CTA ═════ */}
      <section className="landing-footer-cta">
        <div className="landing-footer-cta-inner landing-reveal">
          <Badge label="GEO Intelligence Platform" />
          <RevealText as="h2" className="landing-h2" text="The Smarter Way to Get Cited by AI" />
          <RevealText
            as="p"
            className="landing-body"
            text="Track AI citations and free your team to focus on growth. VentureCite keeps your brand visible across every AI engine — automatically."
            baseDelay={80}
          />
          <div className="landing-hero-ctas">
            <Link href="/register">
              <a className="landing-btn landing-btn-primary">Get Started</a>
            </Link>
            <a href="#faq" className="landing-btn landing-btn-secondary">
              Read FAQ
            </a>
          </div>
        </div>
      </section>

      {/* ═════ FOOTER ═════ */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-top">
            <Link href="/">
              <a className="landing-footer-brand">
                <img src={logoPath} alt="VentureCite" />
                <span>VentureCite</span>
              </a>
            </Link>
            <div className="landing-footer-social">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                >
                  <SocialIcon d={s.d} />
                </a>
              ))}
            </div>
          </div>

          <div className="landing-footer-divider" />

          <div className="landing-footer-bottom">
            <p className="landing-footer-copy">© 2025 VentureCite. All rights reserved.</p>
            <div className="landing-footer-cols">
              <div className="landing-footer-col">
                <span className="landing-footer-col-title">Product</span>
                <a href="#why-venturecite">Why</a>
                <a href="#core-features">Features</a>
                <a href="#product-pillars">Pillars</a>
                <a href="#faq">FAQ</a>
              </div>
              <div className="landing-footer-col">
                <span className="landing-footer-col-title">Company</span>
                <a href="mailto:engineering@litlabs.io">Contact</a>
              </div>
              <div className="landing-footer-col">
                <span className="landing-footer-col-title">Legal</span>
                <a href="/privacy">Privacy Policy</a>
                <a href="#">Terms &amp; Conditions</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
