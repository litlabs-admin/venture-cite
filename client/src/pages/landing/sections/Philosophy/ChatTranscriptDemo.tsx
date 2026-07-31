import { TagCheckIcon } from "./icons";

type Message = {
  role: "You" | "AI";
  text: string;
  // AI rows carry a right-aligned tag: a static checkmark for a completed
  // step, or a pulsing "assistant-breath" dot for an in-progress step. You
  // rows never carry a tag.
  tag?: { label: string; pulsing: boolean };
};

// Card 03 visual - the unique 20-message transcript
// (_reference/index.html:2514-2582), verbatim text and tags, in source
// order. The raw DOM repeats this same sequence many times back-to-back to
// fake a scrolling loop (confirmed by re-reading a sample of the repeats at
// e.g. lines 2584-2654 and 2656-2719, byte-identical to this array) - here
// it's duplicated programmatically instead of hand-copied.
const messages: Message[] = [
  { role: "You", text: "What's quietly costing me answers?" },
  {
    // Source read "Reading how 8 models describe you." - dropped the "8
    // models" count framing (VentureCite's covered engines are ChatGPT,
    // Claude, Perplexity, Gemini, Copilot, Google AI Overview) in favour of
    // naming the engines directly, per rebrand instructions.
    role: "AI",
    text: "Reading how ChatGPT, Claude, Perplexity, and Gemini describe you.",
    tag: { label: "reading", pulsing: true },
  },
  {
    role: "AI",
    text: "Pulled 2,400 prompts across ChatGPT, Claude, Gemini.",
    tag: { label: "pulled", pulsing: false },
  },
  {
    role: "AI",
    text: "Found it. You're invisible on comparison queries.",
    tag: { label: "found", pulsing: false },
  },
  {
    role: "AI",
    text: 'Three rivals own "best alternative to" answers.',
    tag: { label: "mapped", pulsing: false },
  },
  { role: "You", text: "Why are they winning those?" },
  {
    role: "AI",
    text: "They each publish a side-by-side page. You do not.",
    tag: { label: "reason", pulsing: false },
  },
  {
    role: "AI",
    text: "GPTBot is also blocked in your robots.txt.",
    tag: { label: "caught", pulsing: false },
  },
  { role: "You", text: "Fix both" },
  {
    role: "AI",
    text: "Unblocking GPTBot and 4 other AI crawlers.",
    tag: { label: "editing", pulsing: true },
  },
  {
    role: "AI",
    text: "robots.txt shipped. Crawlers can read you now.",
    tag: { label: "shipped", pulsing: false },
  },
  {
    role: "AI",
    text: "Drafting a comparison page from your real specs.",
    tag: { label: "writing", pulsing: true },
  },
  {
    role: "AI",
    text: "Added FAQ schema so models can quote it.",
    tag: { label: "schema", pulsing: false },
  },
  { role: "You", text: "Show me before you publish" },
  {
    role: "AI",
    text: "Preview ready. 1,200 words, 6 head-to-head rows.",
    tag: { label: "preview", pulsing: false },
  },
  { role: "You", text: "Looks right. Go ahead" },
  {
    role: "AI",
    text: "Published and pinged the search engines.",
    tag: { label: "live", pulsing: false },
  },
  {
    role: "AI",
    text: "Re-running the 2,400 prompts to measure lift.",
    tag: { label: "checking", pulsing: true },
  },
  {
    // Source read "Day 9: cited in 4 of 8 models on comparisons." - dropped
    // the "X of 8 models" framing in favour of naming the engines, per
    // rebrand instructions.
    role: "AI",
    text: "Day 9: recommended in ChatGPT and Perplexity comparisons now.",
    tag: { label: "rising", pulsing: false },
  },
  {
    role: "AI",
    text: "You're on the shortlist again. I'll watch for slippage.",
    tag: { label: "watching", pulsing: false },
  },
];

// Duplicated 2x so a translateY(-50%) loop is seamless (same technique as
// WhyNow's MarqueeRow, translateX version). Per the simplify-choreography
// rule, this renders every row already-settled (opacity 1, no per-row
// stagger) instead of the source's 20+ individually-delayed
// opacity/scale/transform entrances.
const duplicated = [0, 1].flatMap((setIndex) =>
  messages.map((message, itemIndex) => ({ ...message, key: `${setIndex}-${itemIndex}` })),
);

function TranscriptRow({ message }: { message: Message }) {
  return (
    <div className="flex items-center gap-2.5" style={{ height: 38 }}>
      <span
        className={`w-[26px] shrink-0 text-[9px] font-medium uppercase tracking-wider ${
          message.role === "You" ? "text-vc-text-muted" : "text-vc-accent"
        }`}
      >
        {message.role}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] leading-snug ${
          message.role === "You" ? "text-vc-secondary" : "text-vc-primary"
        }`}
      >
        {message.text}
      </span>
      {message.tag && (
        <span
          className={`ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-medium ${
            message.tag.pulsing ? "text-vc-text-muted" : "text-vc-accent"
          }`}
        >
          {message.tag.pulsing ? (
            <span className="h-[5px] w-[5px] rounded-full bg-current assistant-breath" />
          ) : (
            <TagCheckIcon />
          )}
          {message.tag.label}
        </span>
      )}
    </div>
  );
}

// Masked-viewport height (120px) and gradient stops (fade in over the first
// 26%, solid 26%-74%, fade out over the last 26%) are verbatim from
// _reference/index.html:2512. Scroll speed (36s, defined on .chat-scroll in
// app/globals.css) was not verified against source - see build report.
export function ChatTranscriptDemo() {
  return (
    <div
      className="w-full rounded-lg p-3 ring-1 ring-vc-hairline"
      style={{ background: "var(--hb-surface-wash)", boxShadow: "var(--hb-shadow-raised)" }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          height: 120,
          WebkitMaskImage:
            "linear-gradient(transparent, rgb(0, 0, 0) 26%, rgb(0, 0, 0) 74%, transparent)",
          maskImage:
            "linear-gradient(transparent, rgb(0, 0, 0) 26%, rgb(0, 0, 0) 74%, transparent)",
        }}
      >
        <div className="chat-scroll">
          {duplicated.map((message) => (
            <TranscriptRow key={message.key} message={message} />
          ))}
        </div>
      </div>
    </div>
  );
}
