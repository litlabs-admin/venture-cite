// Single source of truth for the known-AI-platform badge palette. Previously
// duplicated byte-for-byte in PlatformResultCard.tsx and CitedMentionsStrip.tsx;
// any future palette tweak only needs to happen here now.
//
// Known platforms stay explicit so the brand colors look right; callers decide
// their own fallback for unknown platforms (PlatformResultCard hashes to a
// stable HSL, CitedMentionsStrip uses a neutral muted badge).
export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Claude: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  Gemini: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  Perplexity: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  DeepSeek: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
};
