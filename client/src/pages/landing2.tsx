import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { useInView } from "framer-motion";
import { Menu, X, Check, ChevronDown } from "lucide-react";
import logoPath from "@assets/logo.png";
import heroDashboard from "@assets/landing2/images/HPK0hSpZhhGioXG8c0IYiKITcY.png";
import aboutImage from "@assets/landing2/images/WvNZhR79JhQ4BhgnrQBPUmXgg.png";
import logo0 from "@assets/landing2/logos/0EIEmxtogiwTpTo7lEjARtFLa8.svg";
import logo1 from "@assets/landing2/logos/5nYj2i6tU9yLEAOJRESakSDvp0g.svg";
import logo2 from "@assets/landing2/logos/RK0C79148LnQefLLc4p1LjvgJ20.svg";
import logo3 from "@assets/landing2/logos/rup7262w3KHAvtyJB0CnC6FWHSc.svg";
import logo4 from "@assets/landing2/logos/xdtXSfrXwwIszE0AYnYks93MQUY.svg";
import gifSmartTasks from "@assets/landing2/gifs/smart-tasks.gif";
import gifAutoWorkflows from "@assets/landing2/gifs/auto-workflows.gif";
import gifTeamSync from "@assets/landing2/gifs/team-sync.gif";
import gifInsightsHub from "@assets/landing2/gifs/insights-hub.gif";
import gifEasyIntegrations from "@assets/landing2/gifs/easy-integrations.gif";
import gifSecureSpace from "@assets/landing2/gifs/secure-space.gif";
import avDaniela from "@assets/landing2/avatars/daniela.png";
import avMichael from "@assets/landing2/avatars/michael.png";
import avRyan from "@assets/landing2/avatars/ryan.png";
import avEmily from "@assets/landing2/avatars/emily.png";
import avDaniel from "@assets/landing2/avatars/daniel.png";
import avHannah from "@assets/landing2/avatars/hannah.jpg";
import avPriy from "@assets/landing2/avatars/priy.png";
import avLucas from "@assets/landing2/avatars/lucas.png";
import avOmar from "@assets/landing2/avatars/omar.png";
import tickerGoogleMeet from "@assets/landing2/ticker-logos/google-meet.png";
import tickerLoom from "@assets/landing2/ticker-logos/loom.png";
import tickerCursor from "@assets/landing2/ticker-logos/cursor.png";
import "./landing2.css";

/* ─────────────────────────────────────────
   Hooks
───────────────────────────────────────── */

function useScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      document.querySelectorAll(".l2-reveal").forEach((el) => el.classList.add("in-view"));
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
    document.querySelectorAll(".l2-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useCountUp(target: number, ref: React.RefObject<HTMLElement | null>) {
  const [count, setCount] = useState(0);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-80px" });

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1600, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(e * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target]);

  return count;
}

/* ─────────────────────────────────────────
   Sub-components
───────────────────────────────────────── */

function Badge({ label }: { label: string }) {
  return (
    <span className="l2-badge">
      <span className="l2-badge-dot" />
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
          className={`l2-word${show ? " vis" : ""}`}
          style={{ transitionDelay: `${baseDelay + i * 30}ms` }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

function Stat({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const count = useCountUp(target, ref);
  return (
    <div ref={ref} className="l2-stat">
      <div className="l2-stat-num">
        <span>{count}</span>
        <span className="l2-stat-suffix">{suffix}</span>
      </div>
      <p className="l2-stat-label">{label}</p>
    </div>
  );
}

function QuoteIcon() {
  return (
    <svg
      className="l2-testimonial-quote-icon"
      width="32"
      height="24"
      viewBox="0 0 32 24"
      fill="currentColor"
    >
      <path d="M9 0C4.03 0 0 4.03 0 9v15h12V12H6c0-3.31 2.69-6 6-6V0H9zm17 0c-4.97 0-9 4.03-9 9v15h12V12h-6c0-3.31 2.69-6 6-6V0h-3z" />
    </svg>
  );
}

const SocialIcon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

/* ─────────────────────────────────────────
   Data — VentureCite copy adapted from saaset structure
───────────────────────────────────────── */

const navLinks = [
  { label: "About Us", href: "#about-us" },
  { label: "Why VentureCite", href: "#why-venturecite" },
  { label: "Features", href: "#core-features" },
  { label: "Pricing", href: "#pricing" },
];

const partnerLogos = [logo1, logo3, logo0, logo2, logo4];

const stats = [
  { target: 200, suffix: "+", label: "Citations Tracked" },
  { target: 98, suffix: "%", label: "Detection Accuracy" },
  { target: 50, suffix: "+", label: "AI Engines Monitored" },
  { target: 100, suffix: "+", label: "Brands Powered by VentureCite" },
];

const whyTickerItems = [
  "Track ChatGPT mentions",
  "Monitor Claude citations",
  "Detect Perplexity sources",
  "Audit Gemini answers",
];

const card3MiniCards = [
  {
    icon: tickerGoogleMeet,
    title: "Total Citations",
    pills: [
      { text: "ChatGPT: 412", className: "" },
      { text: "Claude: 287", className: "" },
      { text: "Perplexity: 156", className: "" },
    ],
  },
  {
    icon: tickerLoom,
    title: "Mentions Tracked",
    pills: [
      { text: "+34% This Week", className: "" },
      { text: "Top Source", className: "" },
      { text: "Avg Score: 7.2", className: "" },
    ],
  },
  {
    icon: tickerCursor,
    title: "Brand Health",
    pills: [
      { text: "Total Mentions: 855", className: "green" },
      { text: "Sentiment: 91%", className: "blue" },
      { text: "Best Engine: GPT-5", className: "orange" },
    ],
  },
];

const features = [
  {
    title: "Smart Citation Tracking",
    desc: "Automatically monitor, capture, and surface every AI citation as it happens.",
    gif: gifSmartTasks,
  },
  {
    title: "Auto Optimization",
    desc: "Set rules once and let VentureCite continually tune your content for AI engines.",
    gif: gifAutoWorkflows,
  },
  {
    title: "Team Sync",
    desc: "Real-time reports, shared dashboards, and smoother collaboration across brands.",
    gif: gifTeamSync,
  },
  {
    title: "Insights Hub",
    desc: "Get clear reports on visibility, growth, and opportunities — instantly.",
    gif: gifInsightsHub,
  },
  {
    title: "Easy Integrations",
    desc: "Connect your favorite tools and keep your entire workflow in one place.",
    gif: gifEasyIntegrations,
  },
  {
    title: "Secure Workspace",
    desc: "Your brand data stays encrypted, protected, and available whenever you need it.",
    gif: gifSecureSpace,
  },
];

const pillars = [
  {
    num: "01",
    title: "Smarter Automation",
    desc: "Automate citation monitoring with intelligent rules that adapt to your brand and Increase the Potential Revenue.",
  },
  {
    num: "02",
    title: "Live Performance Insights",
    desc: "Get instant visibility into rankings, mentions, and AI engine performance with real-time analytics.",
  },
  {
    num: "03",
    title: "One-Click Integrations",
    desc: "Connect VentureCite with your favorite tools in seconds to create a truly unified, seamless workspace.",
  },
  {
    num: "04",
    title: "Zero-Delay Collaboration",
    desc: "Work together in real time with instant updates that keep everyone aligned and moving forward.",
  },
  {
    num: "05",
    title: "Bank-Level Security",
    desc: "Your data is protected with encrypted infrastructure designed for reliability, privacy, and trust.",
  },
  {
    num: "06",
    title: "Fast, Frictionless Setup",
    desc: "Start using VentureCite in minutes with an onboarding experience designed for absolute simplicity.",
  },
];

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

const testimonials = [
  {
    name: "Daniela Cruz",
    title: "Founder, ClearPath Consulting",
    img: avDaniela,
    quote:
      "Tracking AI citations, fixing gaps, and reporting back to clients is now fully automated. VentureCite paid for itself in the first week.",
  },
  {
    name: "Michael Roberts",
    title: "CEO, Syncro Labs",
    img: avMichael,
    quote:
      "We stopped having meetings about which AI engines to optimize for. VentureCite just works in the background and saves everyone time.",
  },
  {
    name: "Ryan Matthews",
    title: "Product Lead, Atlas Works",
    img: avRyan,
    quote:
      "VentureCite turned AI visibility into a non-issue. Citations get tracked, scored, and surfaced automatically. One less thing our team has to think about.",
  },
  {
    name: "Emily Chen",
    title: "Growth Manager, Loopstack",
    img: avEmily,
    quote:
      "VentureCite made it effortless to know where our brand shows up across AI search. Fewer surprises, fewer blind spots, a noticeably smoother workflow.",
  },
  {
    name: "Daniel Ortiz",
    title: "E-commerce Manager, PeakGear",
    img: avDaniel,
    quote:
      "VentureCite removed the guesswork from AI visibility. What used to take days of manual auditing now happens in minutes. Hours back every week.",
  },
  {
    name: "Hannah Brooks",
    title: "People Ops, RemoteNest",
    img: avHannah,
    quote:
      "We didn't realize how much time we wasted manually checking ChatGPT and Claude until VentureCite. It quietly saves hours and surfaces what matters.",
  },
  {
    name: "Priy Nair",
    title: "Growth Manager, Loopstack",
    img: avPriy,
    quote:
      "AI visibility used to slow our content workflow. With VentureCite, audits, scoring, and reporting all happen automatically.",
  },
  {
    name: "Lucas Martin",
    title: "Sales Lead, Brightline",
    img: avLucas,
    quote:
      "Prospects find us through ChatGPT before our website. VentureCite made our AI presence frictionless to manage.",
  },
  {
    name: "Omar Khalid",
    title: "Founder, Flowbound",
    img: avOmar,
    quote:
      "From discovery to optimization, everything is automated. VentureCite feels like a small tool with a huge impact on our day-to-day.",
  },
];

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

export default function Landing2() {
  const [navOpen, setNavOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  useScrollReveal();

  // Build columns for testimonials (3 columns of 3 testimonials each, doubled for loop)
  const colA = [testimonials[0], testimonials[3], testimonials[6]];
  const colB = [testimonials[1], testimonials[4], testimonials[7]];
  const colC = [testimonials[2], testimonials[5], testimonials[8]];

  return (
    <div className="l2">
      <Helmet>
        <title>VentureCite — Get Cited by AI Search Engines</title>
        <meta
          name="description"
          content="Track and optimize your brand's visibility in AI-powered search. Monitor citations across ChatGPT, Claude, Perplexity, and more."
        />
      </Helmet>

      {/* ═════ 1. NAV ═════ */}
      <nav className="l2-nav">
        <div className="l2-nav-inner">
          <Link href="/">
            <a className="l2-nav-brand">
              <img src={logoPath} alt="VentureCite" />
              <span>VentureCite</span>
            </a>
          </Link>

          <div className="l2-nav-links">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>

          <div className="l2-nav-ctas">
            <Link href="/login">
              <a className="l2-btn l2-btn-secondary">Log In</a>
            </Link>
            <Link href="/register">
              <a className="l2-btn l2-btn-primary">Get Started</a>
            </Link>
          </div>

          <button
            className="l2-nav-burger"
            onClick={() => setNavOpen((v) => !v)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
          >
            {navOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {navOpen && (
          <div className="l2-nav-drawer">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setNavOpen(false)}>
                {l.label}
              </a>
            ))}
            <div className="l2-nav-drawer-ctas">
              <Link href="/login">
                <a className="l2-btn l2-btn-secondary">Log In</a>
              </Link>
              <Link href="/register">
                <a className="l2-btn l2-btn-primary">Get Started</a>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ═════ 2. HERO ═════ */}
      <section className="l2-hero">
        <div className="l2-hero-inner">
          <Badge label="GEO Intelligence Platform" />

          <div className="l2-hero-text">
            <RevealText
              as="h1"
              className="l2-h1"
              text="The Smarter Way to Get Cited by AI"
              triggerOnMount
              baseDelay={50}
            />
            <RevealText
              as="p"
              className="l2-body"
              text="Track and optimize your brand's visibility across AI-powered search. VentureCite monitors citations across ChatGPT, Claude, Perplexity, and Gemini — automatically."
              triggerOnMount
              baseDelay={250}
            />
          </div>

          <div className="l2-hero-ctas l2-reveal">
            <Link href="/register">
              <a className="l2-btn l2-btn-primary">Get Started</a>
            </Link>
            <a href="#pricing" className="l2-btn l2-btn-secondary">
              View Pricing
            </a>
          </div>

          <div className="l2-hero-image l2-reveal">
            <img src={heroDashboard} alt="VentureCite dashboard" loading="eager" />
          </div>
        </div>
      </section>

      {/* ═════ 3. LOGO TICKER ═════ */}
      <section className="l2-ticker">
        <p>Trusted by 10,000+ brand &amp; marketing teams.</p>
        <div className="l2-ticker-mask">
          <div className="l2-ticker-track">
            {[0, 1, 2].map((g) => (
              <div className="l2-ticker-group" key={g}>
                {partnerLogos.map((src, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 40 }}>
                    <img src={src} alt="" />
                    {i < partnerLogos.length - 1 && <span className="l2-ticker-divider" />}
                  </div>
                ))}
                <span className="l2-ticker-divider" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════ 4. ABOUT US ═════ */}
      <section id="about-us" className="l2-section">
        <div className="l2-about">
          <div className="l2-about-row">
            <div className="l2-about-text l2-reveal">
              <Badge label="About Us" />
              <div className="l2-about-text-inner">
                <RevealText
                  as="h2"
                  className="l2-h2 l2-h2-left"
                  text="The GEO Platform That Runs Itself"
                />
                <RevealText
                  as="p"
                  className="l2-body"
                  text="VentureCite is built on a simple idea — your brand should be cited by AI. We created a smart platform that brings citation tracking, content optimization, brand monitoring, and insights into one clean, unified system. No clutter. No switching tools. No manual follow-ups."
                  baseDelay={80}
                />
              </div>
            </div>
            <div className="l2-about-image l2-reveal" style={{ transitionDelay: "150ms" }}>
              <img src={aboutImage} alt="About VentureCite" loading="lazy" />
            </div>
          </div>

          <div className="l2-stats l2-reveal">
            {stats.map((s) => (
              <Stat key={s.label} target={s.target} suffix={s.suffix} label={s.label} />
            ))}
          </div>
        </div>
      </section>

      {/* ═════ 5. WHY VENTURECITE? ═════ */}
      <section id="why-venturecite" className="l2-section">
        <div className="l2-why">
          <div className="l2-section-head l2-reveal">
            <Badge label="Why VentureCite?" />
            <RevealText
              as="h2"
              className="l2-h2"
              text="Designed to Make AI Visibility Effortless"
            />
            <RevealText
              as="p"
              className="l2-body"
              text="Experience a smoother, smarter way to track and optimize your brand for AI-generated answers."
              baseDelay={80}
            />
          </div>

          <div className="l2-why-grid">
            {/* Card 1 — vertical text ticker */}
            <div className="l2-why-card l2-why-card-1 l2-reveal">
              <div className="l2-why-card-content">
                <div className="l2-vticker">
                  <div className="l2-vticker-track">
                    {[...whyTickerItems, ...whyTickerItems].map((t, i) => (
                      <div key={i} className="l2-vticker-item">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="l2-why-card-text">
                <h3>Intelligent Citation Tracker</h3>
                <p>A unified citation engine that monitors every AI mention in real time.</p>
              </div>
            </div>

            {/* Card 2 — team / cursor mockup */}
            <div
              className="l2-why-card l2-why-card-2 l2-reveal"
              style={{ transitionDelay: "100ms" }}
            >
              <div className="l2-why-card-content">
                <div className="l2-card2-mock">
                  <div className="l2-card2-row">
                    <span className="l2-card2-pill">
                      <span className="l2-badge-dot" />
                      Live
                    </span>
                    <span className="l2-card2-pill">34 Mentions</span>
                  </div>
                  <div className="l2-card2-row">
                    <span className="l2-card2-pill">Avg Score: 7.4</span>
                  </div>
                  <div className="l2-card2-avatars">
                    <img src={avDaniela} alt="" />
                    <img src={avMichael} alt="" />
                    <img src={avEmily} alt="" />
                    <span>Invite More People</span>
                  </div>
                  <img className="l2-card2-cursor" src={tickerCursor} alt="" />
                </div>
              </div>
              <div className="l2-why-card-text">
                <h3>Smooth Teamwork</h3>
                <p>Facilitate instant collaboration and seamless exchange of citation data.</p>
              </div>
            </div>

            {/* Card 3 — search bar + horizontal mini-ticker */}
            <div
              className="l2-why-card l2-why-card-3 l2-reveal"
              style={{ transitionDelay: "200ms" }}
            >
              <div className="l2-why-card-content">
                <div className="l2-card3-mock">
                  <div className="l2-card3-search">
                    <span className="l2-card3-search-input">Search citations</span>
                    <span className="l2-card3-search-btn">Enter</span>
                  </div>
                  <div className="l2-card3-hticker-mask">
                    <div className="l2-card3-hticker">
                      {[...card3MiniCards, ...card3MiniCards].map((c, i) => (
                        <div key={i} className="l2-card3-mini-card">
                          <div className="l2-card3-mini-head">
                            <span>{c.title}</span>
                            <img src={c.icon} alt="" />
                          </div>
                          <div className="l2-card3-mini-pills">
                            <div className="row">
                              <span className={`l2-card3-mini-pill ${c.pills[0].className}`}>
                                {c.pills[0].text}
                              </span>
                              <span className={`l2-card3-mini-pill ${c.pills[1].className}`}>
                                {c.pills[1].text}
                              </span>
                            </div>
                            <span className={`l2-card3-mini-pill ${c.pills[2].className}`}>
                              {c.pills[2].text}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="l2-why-card-text">
                <h3>Advanced Reporting</h3>
                <p>Boost performance and streamline efficiency with deep AI-citation analytics.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════ 6. CORE FEATURES ═════ */}
      <section id="core-features" className="l2-section">
        <div className="l2-features">
          <div className="l2-section-head l2-reveal">
            <Badge label="Core Features" />
            <RevealText as="h2" className="l2-h2" text="Everything You Need. Nothing Extra." />
            <RevealText
              as="p"
              className="l2-body"
              text="A tight, powerful set of features crafted to make your team faster and more focused."
              baseDelay={80}
            />
          </div>

          <div className="l2-features-grid">
            {[features.slice(0, 3), features.slice(3, 6)].map((row, ri) => (
              <div className="l2-features-row" key={ri}>
                {row.map((f, i) => (
                  <div
                    className="l2-feature l2-reveal"
                    key={f.title}
                    style={{ transitionDelay: `${(ri * 3 + i) * 60}ms` }}
                  >
                    <div className="l2-feature-gif">
                      <img src={f.gif} alt="" loading="lazy" />
                    </div>
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════ 7. PRODUCT PILLARS ═════ */}
      <section id="product-pillars" className="l2-section">
        <div className="l2-pillars">
          <div className="l2-section-head l2-reveal">
            <Badge label="Product Pillars" />
            <RevealText as="h2" className="l2-h2" text="What Sets VentureCite Apart" />
            <RevealText
              as="p"
              className="l2-body"
              text="VentureCite goes beyond citation tracking — offering unmatched clarity, automation, and speed for modern teams."
              baseDelay={80}
            />
          </div>

          <div className="l2-pillars-grid">
            {[pillars.slice(0, 3), pillars.slice(3, 6)].map((row, ri) => (
              <div className="l2-pillars-row" key={ri}>
                {row.map((p, i) => (
                  <div
                    className="l2-pillar l2-reveal"
                    key={p.num}
                    style={{ transitionDelay: `${(ri * 3 + i) * 60}ms` }}
                  >
                    <div className="l2-pillar-head">
                      <span className="l2-pillar-num">{p.num}</span>
                    </div>
                    <div className="l2-pillar-body">
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

      {/* ═════ 8. PRICING ═════ */}
      <section id="pricing" className="l2-section">
        <div className="l2-pricing">
          <div className="l2-section-head l2-reveal">
            <Badge label="Pricing" />
            <RevealText
              as="h2"
              className="l2-h2"
              text="Build, Optimize, and Scale Your AI Presence"
            />
            <RevealText
              as="p"
              className="l2-body"
              text="VentureCite gives you enterprise-level AI tracking and optimization at a startup-friendly price."
              baseDelay={80}
            />
          </div>

          <div className="l2-pricing-row">
            {pricing.map((plan, i) => (
              <div
                key={plan.name}
                className={`l2-price-card l2-reveal${plan.featured ? " is-featured" : ""}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="l2-price-head">
                  <p className="l2-price-name">{plan.name}</p>
                  <div className="l2-price-amount">
                    <span className="num">{plan.price}</span>
                    <span className="per">{plan.period}</span>
                  </div>
                  <p className="l2-price-desc">{plan.desc}</p>
                </div>

                <Link href="/register">
                  <a className="l2-btn l2-btn-primary l2-price-cta">Get Started</a>
                </Link>

                <div className="l2-price-divider" />

                <ul className="l2-price-features">
                  {plan.features.map((feat) => (
                    <li key={feat} className="l2-price-feature">
                      <Check size={18} strokeWidth={2.5} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════ 9. TESTIMONIALS ═════ */}
      <section id="testimonials" className="l2-section">
        <div className="l2-testimonials">
          <div className="l2-section-head l2-reveal">
            <Badge label="Testimonials" />
            <RevealText as="h2" className="l2-h2" text="Loved by Teams Who Get Cited" />
            <RevealText
              as="p"
              className="l2-body"
              text="See how modern teams use VentureCite to track citations, stay aligned, and grow AI visibility every day."
              baseDelay={80}
            />
          </div>

          <div className="l2-testimonials-grid">
            <div className="l2-testimonial-col l2-testimonial-col-up">
              {[...colA, ...colA].map((t, i) => (
                <article className="l2-testimonial" key={i}>
                  <QuoteIcon />
                  <p className="l2-testimonial-quote">{t.quote}</p>
                  <div className="l2-testimonial-author">
                    <img src={t.img} alt={t.name} />
                    <div className="l2-testimonial-author-text">
                      <span className="l2-testimonial-author-name">{t.name}</span>
                      <span className="l2-testimonial-author-title">{t.title}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="l2-testimonial-col l2-testimonial-col-down">
              {[...colB, ...colB].map((t, i) => (
                <article className="l2-testimonial" key={i}>
                  <QuoteIcon />
                  <p className="l2-testimonial-quote">{t.quote}</p>
                  <div className="l2-testimonial-author">
                    <img src={t.img} alt={t.name} />
                    <div className="l2-testimonial-author-text">
                      <span className="l2-testimonial-author-name">{t.name}</span>
                      <span className="l2-testimonial-author-title">{t.title}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="l2-testimonial-col l2-testimonial-col-up">
              {[...colC, ...colC].map((t, i) => (
                <article className="l2-testimonial" key={i}>
                  <QuoteIcon />
                  <p className="l2-testimonial-quote">{t.quote}</p>
                  <div className="l2-testimonial-author">
                    <img src={t.img} alt={t.name} />
                    <div className="l2-testimonial-author-text">
                      <span className="l2-testimonial-author-name">{t.name}</span>
                      <span className="l2-testimonial-author-title">{t.title}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═════ 10. FAQ ═════ */}
      <section id="faq" className="l2-section">
        <div className="l2-faq">
          <div className="l2-section-head l2-reveal">
            <Badge label="FAQ" />
            <RevealText as="h2" className="l2-h2" text="Questions? Answers!" />
          </div>

          <div className="l2-faq-list">
            {faqs.map((f, i) => (
              <div
                key={i}
                className={`l2-faq-item l2-reveal ${openFaq === i ? "is-open" : ""}`}
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <button
                  type="button"
                  className="l2-faq-trigger"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="l2-faq-question">{f.q}</span>
                  <ChevronDown size={24} className="l2-faq-chevron" />
                </button>
                <div className="l2-faq-answer">
                  <div className="l2-faq-answer-inner">
                    <p className="l2-faq-answer-text">{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═════ 11. FOOTER CTA ═════ */}
      <section className="l2-footer-cta">
        <div className="l2-footer-cta-inner l2-reveal">
          <Badge label="GEO Intelligence Platform" />
          <RevealText as="h2" className="l2-h2" text="The Smarter Way to Get Cited by AI" />
          <RevealText
            as="p"
            className="l2-body"
            text="Track AI citations and free your team to focus on growth. VentureCite keeps your brand visible across every AI engine — automatically."
            baseDelay={80}
          />
          <div className="l2-hero-ctas">
            <Link href="/register">
              <a className="l2-btn l2-btn-primary">Get Started</a>
            </Link>
            <a href="#pricing" className="l2-btn l2-btn-secondary">
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* ═════ 12. FOOTER ═════ */}
      <footer className="l2-footer">
        <div className="l2-footer-inner">
          <div className="l2-footer-top">
            <Link href="/">
              <a className="l2-footer-brand">
                <img src={logoPath} alt="VentureCite" />
                <span>VentureCite</span>
              </a>
            </Link>
            <div className="l2-footer-social">
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

          <div className="l2-footer-divider" />

          <div className="l2-footer-bottom">
            <p className="l2-footer-copy">© 2025 VentureCite. All rights reserved.</p>
            <div className="l2-footer-cols">
              <div className="l2-footer-col">
                {navLinks.map((l) => (
                  <a key={l.href} href={l.href}>
                    {l.label}
                  </a>
                ))}
                <a href="#faq">FAQ</a>
              </div>
              <div className="l2-footer-col">
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
