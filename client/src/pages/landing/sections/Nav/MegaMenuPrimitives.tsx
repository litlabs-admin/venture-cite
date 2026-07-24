import { ChevronDownIcon, ArrowRightIcon, NavItemIcon } from "./icons";
import { megaMenuEase, type NavItem } from "./data";

// Verbatim from TrakkrNav-JAUeEuWq.js component `U`.
export function MegaMenuTrigger({
  label,
  isOpen,
  controlsId,
  onClick,
}: {
  label: string;
  isOpen: boolean;
  controlsId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={controlsId}
      onClick={onClick}
      className={`h-9 px-4 text-[13px] font-medium transition-all duration-250 rounded flex items-center gap-1.5 ${
        isOpen
          ? "text-vc-primary bg-vc-muted"
          : "text-vc-secondary hover:text-vc-primary hover:bg-vc-muted"
      }`}
    >
      {label}
      <ChevronDownIcon
        size={14}
        className={`transition-transform duration-250 ${isOpen ? "rotate-180" : ""}`}
      />
    </button>
  );
}

// Verbatim from TrakkrNav-JAUeEuWq.js component `V`.
export function MegaMenuPanel({
  isOpen,
  id,
  width,
  children,
}: {
  isOpen: boolean;
  id: string;
  width: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      aria-hidden={!isOpen}
      // React 18's JSX types predate the `inert` attribute; it still reaches
      // the DOM as-is. Drop the cast once the app is on React 19 types.
      {...({ inert: isOpen ? undefined : "" } as Record<string, unknown>)}
      className={`
        absolute top-full left-0 mt-2 ${width}
        bg-vc-surface rounded border border-vc-default shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)]
        transition-all duration-300 origin-top
        ${isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none"}
      `}
      style={{ transitionTimingFunction: megaMenuEase }}
    >
      {children}
    </div>
  );
}

// Verbatim from TrakkrNav-JAUeEuWq.js component `v`. Delay is a flat value
// (not row-staggered) passed in ms by the caller for this specific label.
export function MegaMenuLabel({
  children,
  isVisible = true,
  delay = 0,
}: {
  children: React.ReactNode;
  isVisible?: boolean;
  delay?: number;
}) {
  return (
    <h3
      className={`
        text-[10px] font-semibold uppercase tracking-[0.18em] mb-3 flex items-center gap-2
        transition-all duration-300
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
      `}
      style={{
        transitionDelay: isVisible ? `${delay}ms` : "0ms",
        transitionTimingFunction: megaMenuEase,
        color: "var(--color-accent)",
      }}
    >
      <span>{children}</span>
    </h3>
  );
}

// Verbatim from TrakkrNav-JAUeEuWq.js component `Fe` — Product menu's
// "Features" column item. Row stagger is hardcoded here: 60ms + index*30ms.
// The icon only mounts while the menu is open/opening (isVisible), matching
// the source exactly — it's absent from the closed-state DOM.
export function FeatureLink({
  item,
  index,
  isVisible,
}: {
  item: NavItem;
  index: number;
  isVisible: boolean;
}) {
  return (
    <a
      href={item.href}
      className={`
        relative flex items-start gap-3 py-2 -ml-3 -mr-2 pl-1 pr-2 rounded
        transition-all group
        hover:bg-vc-accent-subtle/50
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
      style={{
        transitionDelay: isVisible ? `${60 + index * 30}ms` : "0ms",
        transitionDuration: "300ms",
        transitionTimingFunction: megaMenuEase,
      }}
    >
      {isVisible && <NavItemIcon item={item} size={40} />}
      <div className="flex flex-col min-w-0 pt-1">
        <span className="text-[13px] font-medium text-vc-primary leading-tight tracking-tight transition-colors group-hover:text-vc-accent-hover">
          {item.name}
        </span>
        <span
          className="text-[11.5px] leading-snug mt-0.5"
          style={{ color: "var(--color-text-muted)" }}
        >
          {item.description}
        </span>
      </div>
    </a>
  );
}

// Verbatim from TrakkrNav-JAUeEuWq.js component `I` — Product menu's
// "Solutions"/"Tools" list rows. baseDelay is passed by the caller per group.
export function MegaMenuLinkRow({
  item,
  index,
  baseDelay,
  isVisible,
}: {
  item: NavItem;
  index: number;
  baseDelay: number;
  isVisible: boolean;
}) {
  const className = `
    group relative flex items-center justify-between gap-2 py-[7px] -mx-2 px-2 rounded
    text-[12.5px] font-medium text-vc-secondary tracking-tight
    transition-all
    hover:text-vc-accent-hover hover:bg-vc-accent-subtle/40
    ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
  `;
  const style = {
    transitionDelay: isVisible ? `${baseDelay + index * 30}ms` : "0ms",
    transitionDuration: "300ms",
    transitionTimingFunction: megaMenuEase,
  };
  const content = (
    <>
      <span>{item.name}</span>
      <ArrowRightIcon
        size={11}
        className="text-vc-accent opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
      />
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} className={className} style={style}>
        {content}
      </a>
    );
  }
  return (
    <a href={item.href} className={className} style={style}>
      {content}
    </a>
  );
}
