// Reassurance-row engine logos, in the reference's order. All eight assets
// exist under client/public/venturecite/images/ai-logos/ as .svg.
const logos = [
  { alt: "ChatGPT", src: "/venturecite/images/ai-logos/chatgpt.svg" },
  { alt: "Perplexity", src: "/venturecite/images/ai-logos/perplexity.svg" },
  { alt: "Claude", src: "/venturecite/images/ai-logos/claude.svg" },
  { alt: "Gemini", src: "/venturecite/images/ai-logos/gemini.svg" },
  { alt: "Google", src: "/venturecite/images/ai-logos/google.svg" },
  { alt: "Grok", src: "/venturecite/images/ai-logos/grok.svg" },
  { alt: "Meta AI", src: "/venturecite/images/ai-logos/meta-ai.svg" },
  { alt: "DeepSeek", src: "/venturecite/images/ai-logos/deepseek.svg" },
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
          className="h-3.5 w-3.5 object-contain opacity-80 hover:opacity-100 transition-all duration-300"
        />
      ))}
    </div>
  );
}
