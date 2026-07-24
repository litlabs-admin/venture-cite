import type { ReactNode } from "react";
import type { FooterLink } from "./data";

interface FooterColumnProps {
  title: string;
  links: FooterLink[];
  size: "mobile" | "desktop";
  /** Extra trailing item after the plain links, e.g. the Free Tools trigger. */
  children?: ReactNode;
}

// Mobile (index.html:3644-3647) vs desktop (index.html:3691-3695) column
// label/link classes are genuinely different sizes, not just a responsive
// variant of one class string, so both are captured verbatim below.
const SIZE = {
  mobile: {
    label: "text-[9px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted mb-2",
    list: "space-y-1.5",
    link: "block text-[11px] text-vc-secondary hover:text-vc-accent transition-colors",
  },
  desktop: {
    label: "text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted mb-3",
    list: "space-y-2",
    link: "block text-[12px] text-vc-secondary hover:text-vc-accent transition-colors duration-150",
  },
} as const;

export function FooterColumn({ title, links, size, children }: FooterColumnProps) {
  const s = SIZE[size];
  return (
    <>
      <div className={s.label}>{title}</div>
      <div className={s.list}>
        {links.map((link, i) => (
          <a key={`${link.href}-${i}`} href={link.href} className={s.link}>
            {link.name}
          </a>
        ))}
        {children}
      </div>
    </>
  );
}
