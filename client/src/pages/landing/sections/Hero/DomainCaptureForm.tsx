import { Link } from "@tanstack/react-router";

import { ArrowRightIcon } from "./icons";

// The domain input this component is named for was dropped upstream in favour
// of a single standalone CTA. The reference's button is inert (that page has
// no backend); ours navigates to /register, which is the same destination as
// the nav and footer CTAs.
export function DomainCaptureForm() {
  return (
    <div className="flex justify-center">
      {/* The page's single conversion CTA - the BLUE tier of the two-tier
          button system (the nav CTA is the subtle accent wash). Flat solid
          fill, no gradient, no shadow. */}
      <Link
        to="/register"
        className="shrink-0 h-11 px-6 rounded bg-vc-accent text-white text-ui font-medium hover:bg-vc-accent-hover transition-colors duration-150 inline-flex items-center gap-1.5"
      >
        <span>Get started</span>
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  );
}
