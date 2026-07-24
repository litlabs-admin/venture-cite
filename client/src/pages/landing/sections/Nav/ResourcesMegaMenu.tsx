import { useMegaMenu } from "@/pages/landing/hooks/useMegaMenu";
import { MegaMenuTrigger, MegaMenuPanel } from "./MegaMenuPrimitives";
import { ArrowRightIcon, NavItemIcon } from "./icons";
import { resourcesFeatured, resourcesList, resourcesFooterLinks, megaMenuEase } from "./data";

const MENU_ID = "venturecite-resources-menu";

export function ResourcesMegaMenu() {
  const { isOpen, containerProps, open } = useMegaMenu();

  return (
    <div className="relative" {...containerProps}>
      <MegaMenuTrigger label="Resources" isOpen={isOpen} controlsId={MENU_ID} onClick={open} />
      <MegaMenuPanel isOpen={isOpen} id={MENU_ID} width="w-[560px]">
        <div className="grid grid-cols-[220px_1fr]">
          <a
            href={resourcesFeatured.href}
            className={`
              group p-6 border-r border-vc-default flex flex-col gap-3
              hover:bg-vc-accent-subtle/30 transition-colors
              ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
            `}
            style={{
              transitionDelay: isOpen ? "40ms" : "0ms",
              transitionDuration: "300ms",
              transitionTimingFunction: megaMenuEase,
            }}
          >
            <div className="flex items-center justify-center h-32">
              {isOpen && <NavItemIcon item={resourcesFeatured} size={108} />}
            </div>
            <div>
              <div className="text-[15px] font-semibold text-vc-primary tracking-tight leading-tight transition-colors group-hover:text-vc-accent-hover">
                {resourcesFeatured.name}
              </div>
              <p
                className="text-[12px] leading-relaxed mt-1.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                {resourcesFeatured.description}
              </p>
              <span className="text-[11.5px] font-medium text-vc-accent inline-flex items-center gap-1 mt-3">
                Explore
                <ArrowRightIcon
                  size={11}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </div>
          </a>
          <div className="p-6 flex flex-col">
            <div className="space-y-0.5">
              {resourcesList.map((item, index) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={`
                    group flex items-center gap-3 py-2 -mx-2 px-2 rounded
                    transition-colors hover:bg-vc-accent-subtle/40
                    ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
                  `}
                  style={{
                    transitionDelay: isOpen ? `${80 + index * 30}ms` : "0ms",
                    transitionDuration: "300ms",
                    transitionTimingFunction: megaMenuEase,
                  }}
                >
                  {isOpen && <NavItemIcon item={item} size={32} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-vc-primary leading-tight tracking-tight transition-colors group-hover:text-vc-accent-hover">
                      {item.name}
                    </div>
                    <div
                      className="text-[11.5px] leading-snug mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {item.description}
                    </div>
                  </div>
                </a>
              ))}
            </div>
            <div
              className={`
                mt-auto pt-4 flex items-center gap-5
                transition-all
                ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
              `}
              style={{
                transitionDelay: isOpen ? "240ms" : "0ms",
                transitionDuration: "300ms",
                transitionTimingFunction: megaMenuEase,
              }}
            >
              {/* Both branches of the source's external/internal ternary rendered
                  the same <a> once next/Link was dropped, and no footer link is
                  external any more. */}
              {resourcesFooterLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-[11.5px] tracking-tight hover:text-vc-accent-hover transition-colors"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </MegaMenuPanel>
    </div>
  );
}
