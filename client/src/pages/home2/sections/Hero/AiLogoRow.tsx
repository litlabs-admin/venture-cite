// Verbatim order/filenames from _reference/index.html lines 929-934.
// `unoptimized` is set because Next's built-in image optimizer rejects
// image/svg+xml by default (images.dangerouslyAllowSVG is unset in
// next.config.ts) — these are tiny static vector icons that don't need
// optimization anyway.
const logos = [
  { alt: "ChatGPT", src: "/trakkr/images/ai-logos/chatgpt.svg" },
  { alt: "Perplexity", src: "/trakkr/images/ai-logos/perplexity.svg" },
  { alt: "Claude", src: "/trakkr/images/ai-logos/claude.svg" },
  { alt: "Gemini", src: "/trakkr/images/ai-logos/gemini.svg" },
  { alt: "Google", src: "/trakkr/images/ai-logos/google.svg" },
];

export function AiLogoRow() {
  return (
    <div className="flex items-center gap-2.5">
      {logos.map((logo) => (
        <img
          key={logo.src}
          src={logo.src}
          alt={logo.alt}
          title={logo.alt}
          width={14}
          height={14}
          loading="lazy"
          className="h-3.5 w-3.5 object-contain opacity-40 hover:opacity-70 transition-all duration-300"
        />
      ))}
    </div>
  );
}
