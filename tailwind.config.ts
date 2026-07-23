import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
          subtle: "var(--negative-subtle)",
        },
        /* Functional status. These exist as Tailwind keys so components can
           stop reaching for raw palette classes (text-green-600, bg-amber-50,
           …), which bypass the theme entirely and don't follow light/dark.
           `subtle` is the badge/callout background; use it instead of an
           opacity modifier, which v3 cannot compute on a bare var(). */
        positive: {
          DEFAULT: "var(--positive)",
          subtle: "var(--positive-subtle)",
          foreground: "var(--color-on-strong)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          subtle: "var(--warning-subtle)",
          foreground: "var(--color-on-strong)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Trakkr marketing-page tokens, used only by client/src/pages/home2.
        // Literal hex (not vars) so opacity modifiers like bg-tk-muted/60 work,
        // and namespaced under `tk` so they can't collide with the shadcn keys
        // above. Values copied verbatim from trakkr.ai/app/globals.css @theme.
        // NOTE: `muted` and `text-muted` are deliberately different colors —
        // the source's .text-muted resolves to gray-500, .bg-muted to gray-100.
        tk: {
          surface: "#fff",
          page: "#fff",
          primary: "#1c1917",
          secondary: "#57534e",
          tertiary: "#78716c",
          "text-muted": "#78716c",
          placeholder: "#78716c",
          muted: "#f5f5f4",
          subtle: "#f5f5f4",
          default: "#e7e5e4",
          hover: "#d6d3d1",
          faint: "#d6d3d1",
          accent: "#0e9373",
          "accent-subtle": "#e4f6f2",
          "accent-hover": "#0c7a60",
          success: "#0e9373",
        },
      },
      boxShadow: {
        "tk-card": "0 1px 3px 0 #0000000a",
        "tk-overlay": "0 4px 16px -4px #00000014",
      },
      // Trakkr steps that Tailwind v3 has no equivalent for. 250ms came from
      // the source's --duration-250 token; 450ms + the easing were arbitrary
      // values in v4 (`duration-[450ms]`, `ease-[cubic-bezier(...)]`), which
      // v3 rejects as ambiguous and silently drops.
      transitionDuration: {
        "250": "250ms",
        "450": "450ms",
      },
      transitionTimingFunction: {
        tk: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.04)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "blob-drift": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(20px,-30px) scale(1.05)" },
          "66%": { transform: "translate(-20px,20px) scale(0.95)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.8s ease-out both",
        float: "float 6s ease-in-out infinite",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        marquee: "marquee 30s linear infinite",
        "gradient-shift": "gradient-shift 8s ease infinite",
        shimmer: "shimmer 2.5s linear infinite",
        "blob-drift": "blob-drift 14s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
