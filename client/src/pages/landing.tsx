import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Helmet } from "react-helmet";
import Navbar from "@/components/Navbar";
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
  X
} from "lucide-react";
import { SiOpenai, SiStripe } from "react-icons/si";

export default function Landing() {
  const [monthlyTraffic, setMonthlyTraffic] = useState([50000]);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  // ROI Calculator
  const estimatedCitations = Math.round(monthlyTraffic[0] * 0.023);
  const estimatedRevenue = Math.round(estimatedCitations * 12.5);
  const annualValue = estimatedRevenue * 12;

  const features = [
    {
      icon: Brain,
      title: "Share of Answer Tracking",
      description: "Track exactly how often AI engines mention your brand when users ask relevant questions.",
    },
    {
      icon: Target,
      title: "Citation Intelligence",
      description: "Monitor when and where your content gets cited across ChatGPT, Claude, Perplexity, and more.",
    },
    {
      icon: LineChart,
      title: "Client Reporting Dashboard",
      description: "Professional reports with KPIs: Brand Mention Frequency, Share of Voice, Citation Rate, and Prompt Coverage.",
    },
    {
      icon: FileText,
      title: "AI Content Generation",
      description: "Generate citation-optimized articles and FAQs designed to get cited by generative engines.",
    },
  ];

  const stats = [
    { value: "47%", label: "Average visibility increase", desc: "in first 90 days" },
    { value: "2.3x", label: "More citations", desc: "vs. traditional SEO" },
    { value: "150+", label: "Brands optimized", desc: "across industries" },
  ];

  const aiPlatforms = [
    "ChatGPT", "Claude", "Perplexity", "Gemini", "Google AI Overview", "Copilot"
  ];

  return (
    <>
      <Helmet>
        <title>VentureCite - Get Cited by AI Search Engines</title>
        <meta name="description" content="Track and optimize your brand's visibility in AI-powered search. Monitor citations across ChatGPT, Claude, Perplexity, and more." />
        <meta property="og:title" content="VentureCite - Generative Engine Optimization" />
        <meta property="og:description" content="The leading platform for AI search visibility." />
      </Helmet>

      <div className="min-h-screen bg-stone-50 text-gray-900">
        <Navbar />

        <section className="relative overflow-hidden pt-20 pb-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <Badge className="mb-6 bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200" data-testid="badge-launch">
                <Sparkles className="w-3 h-3 mr-1.5 text-red-600" /> Generative Engine Optimization
              </Badge>
              
              <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.1] tracking-tight text-gray-900" data-testid="text-hero-title">
                Get Cited by
                <span className="block bg-gradient-to-r from-red-500 via-red-600 to-red-700 bg-clip-text text-transparent">
                  AI Search Engines
                </span>
              </h1>

              <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-description">
                Track your brand's visibility across ChatGPT, Claude, Perplexity, and Gemini. 
                Optimize content that AI engines want to cite.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
                <a href="/register">
                  <Button size="lg" className="bg-red-600 text-white hover:bg-red-700 text-base px-8 h-12 font-medium" data-testid="button-hero-cta">
                    Start Free Trial <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </a>
                <Link href="/pricing">
                  <Button size="lg" variant="outline" className="border-gray-300 text-gray-900 hover:bg-gray-100 text-base px-8 h-12" data-testid="button-hero-pricing">
                    View Pricing
                  </Button>
                </Link>
              </div>

              <div className="relative max-w-3xl mx-auto">
                <div className="bg-white backdrop-blur border border-gray-200 rounded-xl p-6 shadow-xl">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/80" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                      <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <span className="text-sm text-gray-500">venturecite.com/dashboard</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-100 rounded-lg p-4">
                      <div className="text-2xl font-bold text-red-600">23.4%</div>
                      <div className="text-xs text-gray-500">Share of Answer</div>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-600">847</div>
                      <div className="text-xs text-gray-500">Citations This Week</div>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-600">+12.3%</div>
                      <div className="text-xs text-gray-500">Growth Rate</div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-gray-600">Latest AI Citation</span>
                    </div>
                    <p className="text-sm text-gray-700">
                      "According to <span className="text-red-600 font-medium">VentureCite</span>, optimizing for AI search requires..."
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs bg-gray-200 text-gray-700">ChatGPT</Badge>
                      <span className="text-xs text-gray-500">2 minutes ago</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 border-y border-gray-200">
          <div className="container mx-auto px-4">
            <p className="text-center text-sm text-gray-500 mb-6">Tracking citations across</p>
            <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
              {aiPlatforms.map((platform) => (
                <span key={platform} className="text-gray-600 font-medium text-lg">
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <Badge className="mb-4 bg-red-50 text-red-600 border-red-200" data-testid="badge-waitlist">
                <Mail className="w-3 h-3 mr-1.5" /> Join the Waitlist
              </Badge>
              <h2 className="text-2xl md:text-3xl font-bold mb-3 text-gray-900" data-testid="text-waitlist-title">
                Get Early Access & Updates
              </h2>
              <p className="text-gray-600 mb-6">
                Join 500+ marketers tracking AI visibility. Be first to know about new features and insights.
              </p>
              
              {emailSubmitted ? (
                <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg px-6 py-4" data-testid="waitlist-success">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>You're on the list! We'll be in touch soon.</span>
                </div>
              ) : (
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!email) return;
                    try {
                      const res = await fetch('/api/waitlist', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, source: 'landing' })
                      });
                      // Guard response.json() — a 502/HTML error page would
                      // crash the parser and swallow the error silently.
                      let data: any = {};
                      try { data = await res.json(); } catch {}
                      if (res.ok && data.success) {
                        setEmailSubmitted(true);
                      } else {
                        console.warn('Waitlist signup failed:', data.error || res.status);
                      }
                    } catch (err) {
                      console.error('Waitlist signup failed:', err);
                    }
                  }}
                  className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                  data-testid="form-waitlist"
                >
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 h-12"
                    data-testid="input-waitlist-email"
                  />
                  <Button 
                    type="submit" 
                    size="lg"
                    className="bg-red-600 hover:bg-red-700 text-white h-12 px-8 whitespace-nowrap"
                    data-testid="button-waitlist-submit"
                  >
                    Join Waitlist
                  </Button>
                </form>
              )}
              
              <p className="text-xs text-gray-500 mt-4">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </section>

        <section className="py-24 bg-stone-50">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-red-500 via-red-600 to-red-700 bg-clip-text text-transparent mb-2">
                    {stat.value}
                  </div>
                  <div className="text-lg text-gray-900 mb-1">{stat.label}</div>
                  <div className="text-sm text-gray-500">{stat.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-white" id="features">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-features-title">
                Built for the AI Search Era
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Traditional SEO tools weren't built for generative AI. VentureCite was.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {features.map((feature) => (
                <div 
                  key={feature.title} 
                  className="group bg-gray-50 border border-gray-200 rounded-xl p-6 hover:border-red-300 transition-all duration-300"
                  data-testid={`feature-card-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center mb-4 group-hover:bg-red-100 transition-colors">
                    <feature.icon className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 border-y border-gray-200 bg-stone-50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">
                    Your content has the answers.
                    <span className="block text-gray-500">AI just needs to find it.</span>
                  </h2>
                  <p className="text-gray-600 mb-8 leading-relaxed">
                    We analyze how AI engines understand and cite your content. 
                    Then we help you optimize for maximum visibility in AI-generated responses.
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">Real-time citation monitoring across all major AI platforms</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">AI-optimized content generation with brand voice</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">Competitive intelligence and share-of-answer tracking</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                      <span className="text-sm text-gray-600">ChatGPT Citations</span>
                      <span className="text-lg font-semibold text-gray-900">342</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                      <span className="text-sm text-gray-600">Claude Citations</span>
                      <span className="text-lg font-semibold text-gray-900">256</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                      <span className="text-sm text-gray-600">Perplexity Citations</span>
                      <span className="text-lg font-semibold text-gray-900">189</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg">
                      <span className="text-sm text-gray-600">Gemini Citations</span>
                      <span className="text-lg font-semibold text-gray-900">128</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-gray-50" id="how-it-works">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-red-50 text-red-600 border-red-200">
                Simple Process
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-how-it-works-title">
                Get Started in 3 Steps
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                From signup to AI visibility improvement in under 10 minutes
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                  1
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">Connect Your Brand</h3>
                <p className="text-gray-600">
                  Add your brand details, website, and key products. We'll analyze your current AI visibility.
                </p>
                <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-red-300 to-transparent" />
              </div>
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                  2
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">Generate Optimized Content</h3>
                <p className="text-gray-600">
                  Our AI creates citation-optimized articles and FAQs designed for AI search engines.
                </p>
                <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-red-300 to-transparent" />
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                  3
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">Track & Grow Citations</h3>
                <p className="text-gray-600">
                  Monitor your brand mentions across ChatGPT, Claude, Perplexity, and more in real-time.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-white" id="expert-quotes">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-green-50 text-green-600 border-green-200">
                Industry Insights
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-testimonials-title">
                What Experts Say About GEO
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  quote: "By 2026, traditional search engine volume will drop 25% as users embrace AI chatbots and virtual agents. Brands need to optimize for AI discovery now.",
                  author: "Gartner Research",
                  role: "2024 Prediction",
                  company: "",
                  avatar: "GR"
                },
                {
                  quote: "The future of search is conversational. Brands that aren't optimizing for AI-generated answers will be invisible to a growing segment of consumers.",
                  author: "Rand Fishkin",
                  role: "CEO",
                  company: "SparkToro",
                  avatar: "RF"
                },
                {
                  quote: "GEO is the new SEO. As AI becomes the primary interface for information discovery, traditional optimization strategies become obsolete.",
                  author: "Marketing AI Institute",
                  role: "Industry Report",
                  company: "",
                  avatar: "MA"
                }
              ].map((testimonial, i) => (
                <Card key={i} className="bg-gray-50 border-gray-200 hover:border-red-300 transition-colors" data-testid={`testimonial-card-${i}`}>
                  <CardContent className="pt-6">
                    <div className="flex gap-1 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <Quote className="w-8 h-8 text-red-200 mb-3" />
                    <p className="text-gray-700 mb-6 leading-relaxed">
                      "{testimonial.quote}"
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 flex items-center justify-center text-sm font-medium text-white">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{testimonial.author}</div>
                        <div className="text-sm text-gray-500">{testimonial.role}, {testimonial.company}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-gray-50" id="comparison">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-blue-50 text-blue-600 border-blue-200">
                Why Choose Us
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-comparison-title">
                VentureCite vs. The Competition
              </h2>
              <p className="text-lg text-gray-600">
                See why leading brands choose VentureCite for AI search optimization
              </p>
            </div>

            <div className="max-w-4xl mx-auto overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-4 text-gray-600 font-medium">Feature</th>
                    <th className="py-4 px-4 text-center">
                      <div className="inline-flex items-center gap-2 bg-red-50 px-3 py-1 rounded-full">
                        <span className="font-bold text-red-600">VentureCite</span>
                      </div>
                    </th>
                    <th className="py-4 px-4 text-center text-gray-600">Searchable.ai</th>
                    <th className="py-4 px-4 text-center text-gray-600">Traditional SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "AI Citation Tracking", us: true, comp1: true, comp2: false },
                    { feature: "Share of Answer Analysis", us: true, comp1: true, comp2: false },
                    { feature: "AI Content Generation", us: true, comp1: true, comp2: false },
                    { feature: "Publication Outreach Automation", us: true, comp1: false, comp2: false },
                    { feature: "Google AI 7-Signal Optimization", us: true, comp1: false, comp2: false },
                    { feature: "Intelligent FAQ Optimization", us: true, comp1: false, comp2: false },
                    { feature: "Starting Price", us: "$79/mo", comp1: "$125/mo", comp2: "$3,000+/mo" },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-4 px-4 text-gray-700">{row.feature}</td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.us === 'boolean' ? (
                          row.us ? <Check className="w-5 h-5 text-green-600 mx-auto" /> : <X className="w-5 h-5 text-red-500 mx-auto" />
                        ) : (
                          <span className="text-red-600 font-bold">{row.us}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.comp1 === 'boolean' ? (
                          row.comp1 ? <Check className="w-5 h-5 text-gray-400 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
                        ) : (
                          <span className="text-gray-600">{row.comp1}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.comp2 === 'boolean' ? (
                          row.comp2 ? <Check className="w-5 h-5 text-gray-400 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
                        ) : (
                          <span className="text-gray-600">{row.comp2}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="py-24 bg-white" id="roi-calculator">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <Badge className="mb-4 bg-green-50 text-green-600 border-green-200">
                  Calculate Your ROI
                </Badge>
                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-roi-title">
                  What Could AI Visibility Be Worth?
                </h2>
                <p className="text-lg text-gray-600">
                  Estimate your potential revenue from AI search citations
                </p>
              </div>

              <Card className="bg-gray-50 border-gray-200">
                <CardContent className="pt-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-4">
                        Your Monthly Website Traffic
                      </label>
                      <Slider
                        value={monthlyTraffic}
                        onValueChange={setMonthlyTraffic}
                        min={1000}
                        max={500000}
                        step={1000}
                        className="mb-2"
                        data-testid="slider-monthly-traffic"
                      />
                      <div className="text-2xl font-bold text-red-600">
                        {monthlyTraffic[0].toLocaleString()} visitors/month
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        Based on industry averages for AI citation conversion rates
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-gray-100 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Estimated Monthly AI Citations</div>
                        <div className="text-3xl font-bold text-gray-900">{estimatedCitations.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Estimated Monthly Value</div>
                        <div className="text-3xl font-bold text-green-600">${estimatedRevenue.toLocaleString()}</div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="text-sm text-red-700 mb-1">Estimated Annual Value</div>
                        <div className="text-4xl font-bold text-red-600">${annualValue.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 text-center">
                    <a href="/register">
                      <Button size="lg" className="bg-red-600 text-white hover:bg-red-700" data-testid="button-roi-cta">
                        Start Capturing This Value <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-24 bg-gray-50" id="benchmarks">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-orange-50 text-orange-600 border-orange-200">
                Industry Benchmarks
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-benchmarks-title">
                What Top Brands Achieve with GEO
              </h2>
              <p className="text-gray-500 text-sm">Based on industry research and published case studies</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  category: "SaaS Companies",
                  industry: "Project Management & Productivity",
                  metric: "3-8x",
                  description: "Increase in AI mentions",
                  detail: "Brands optimizing for GEO see 300-800% growth in citations",
                  color: "from-red-500 to-red-600"
                },
                {
                  category: "E-commerce",
                  industry: "Consumer & Retail",
                  metric: "$50-150K",
                  description: "Annual AI-driven revenue",
                  detail: "Mid-market brands capturing AI recommendation traffic",
                  color: "from-green-500 to-emerald-500"
                },
                {
                  category: "B2B Platforms",
                  industry: "Marketing & Sales Technology",
                  metric: "15-25%",
                  description: "Share of Answer potential",
                  detail: "Category leaders in competitive 'best tool' queries",
                  color: "from-blue-500 to-cyan-500"
                }
              ].map((study, i) => (
                <Card key={i} className="bg-white border-gray-200 overflow-hidden" data-testid={`benchmark-card-${i}`}>
                  <div className={`h-2 bg-gradient-to-r ${study.color}`} />
                  <CardContent className="pt-6">
                    <div className="text-sm text-gray-500 mb-1">{study.industry}</div>
                    <div className="font-semibold text-gray-900 mb-4">{study.category}</div>
                    <div className={`text-5xl font-bold bg-gradient-to-r ${study.color} bg-clip-text text-transparent mb-2`}>
                      {study.metric}
                    </div>
                    <div className="text-lg text-gray-900 mb-2">{study.description}</div>
                    <div className="text-sm text-gray-600">{study.detail}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-white" id="faq">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <Badge className="mb-4 bg-yellow-50 text-yellow-600 border-yellow-200">
                Questions & Answers
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900" data-testid="text-faq-title">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="max-w-3xl mx-auto space-y-4">
              {[
                {
                  q: "What is Generative Engine Optimization (GEO)?",
                  a: "GEO is the practice of optimizing your content and brand presence to appear in AI-generated responses from ChatGPT, Claude, Perplexity, Google AI Overview, and other AI search engines. Unlike traditional SEO which focuses on Google's 10 blue links, GEO focuses on getting your brand cited when AI answers user questions."
                },
                {
                  q: "How long does it take to see results?",
                  a: "Most customers see measurable improvements within 30-60 days. Initial citation tracking begins immediately, and content optimization typically shows impact within 2-4 weeks as AI models refresh their knowledge bases."
                },
                {
                  q: "Which AI platforms do you track?",
                  a: "We track citations across ChatGPT (including GPT-4), Claude, Perplexity, Google AI Overview, Gemini, Microsoft Copilot, and other emerging AI search platforms. We continuously add new platforms as they gain market share."
                },
                {
                  q: "How is VentureCite different from Searchable.ai?",
                  a: "While both platforms track AI citations, VentureCite offers additional features like AI-optimized content generation, publication outreach automation, Google's 7-signal optimization, and ROI tracking—all at a lower price point ($79/mo vs $149/mo)."
                },
                {
                  q: "Do I need technical knowledge to use VentureCite?",
                  a: "No technical knowledge required. Our platform is designed for marketing teams and business owners. Simply add your brand, and we handle the technical optimization, tracking, and reporting automatically."
                },
                {
                  q: "Can I cancel my subscription anytime?",
                  a: "Yes, you can cancel your subscription at any time with no cancellation fees. Your access continues until the end of your billing period."
                }
              ].map((faq, i) => (
                <div 
                  key={i} 
                  className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden"
                  data-testid={`faq-item-${i}`}
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-100 transition-colors"
                    data-testid={`button-faq-toggle-${i}`}
                  >
                    <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
                    {expandedFaq === i ? (
                      <ChevronUp className="w-5 h-5 text-red-600 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                    )}
                  </button>
                  {expandedFaq === i && (
                    <div className="px-5 pb-5 text-gray-600 leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 border-y border-gray-200 bg-stone-50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-500">Trusted & Secure</p>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
              <div className="flex items-center gap-2 text-gray-600">
                <Shield className="w-5 h-5 text-green-600" />
                <span>SOC 2 Compliant</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Lock className="w-5 h-5 text-blue-600" />
                <span>256-bit Encryption</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <SiStripe className="w-5 h-5 text-red-600" />
                <span>Secure Payments</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <SiOpenai className="w-5 h-5 text-green-600" />
                <span>OpenAI Partner</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Award className="w-5 h-5 text-yellow-600" />
                <span>GDPR Compliant</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <Card className="max-w-3xl mx-auto bg-red-50 border-red-200">
              <CardContent className="pt-8 pb-8">
                <div className="text-center">
                  <Badge className="mb-4 bg-red-100 text-red-700 border-red-300">
                    Free Resource
                  </Badge>
                  <h3 className="text-2xl md:text-3xl font-bold mb-3 text-gray-900">
                    Get Our GEO Strategy Guide
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-xl mx-auto">
                    Learn the 7 tactics top brands use to dominate AI search results. 
                    Includes case studies, templates, and a GEO audit checklist.
                  </p>
                  
                  {emailSubmitted ? (
                    <div className="flex items-center justify-center gap-2 text-green-600" data-testid="text-email-success">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Check your inbox! Guide is on its way.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                      <Input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500"
                        data-testid="input-lead-email"
                      />
                      <Button 
                        onClick={() => setEmailSubmitted(true)}
                        className="bg-red-600 text-white hover:bg-red-700"
                        data-testid="button-lead-submit"
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Get Free Guide
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-24 border-t border-gray-200 bg-stone-50">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-4 py-2 mb-8">
                <Shield className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700">Enterprise-grade security</span>
              </div>
              
              <h2 className="text-3xl md:text-5xl font-bold mb-6 text-gray-900">
                Ready to dominate AI search?
              </h2>
              <p className="text-xl text-gray-600 mb-10">
                Join leading brands already optimizing for the AI-first future.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="/register">
                  <Button size="lg" className="bg-red-600 text-white hover:bg-red-700 text-base px-8 h-12 font-medium" data-testid="button-cta-start">
                    Get Started Free <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </a>
                <Link href="/pricing">
                  <Button size="lg" variant="outline" className="border-gray-300 text-gray-900 hover:bg-gray-100 text-base px-8 h-12" data-testid="button-cta-pricing">
                    See Plans
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="py-12 border-t border-gray-200 bg-white">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 via-red-600 to-red-700 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">V</span>
                </div>
                <span className="font-bold text-xl text-gray-900">VentureCite</span>
              </div>
              <div className="flex gap-8 text-sm text-gray-600">
                <Link href="/pricing" className="hover:text-gray-900 transition-colors">Pricing</Link>
                <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
                <a href="#" className="hover:text-gray-900 transition-colors">Privacy</a>
                <a href="#" className="hover:text-gray-900 transition-colors">Terms</a>
              </div>
              <p className="text-sm text-gray-400">
                © 2025 VentureCite
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
