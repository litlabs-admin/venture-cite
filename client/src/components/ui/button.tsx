import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Disabled state is its own neutral treatment, not a dimmed variant: a
  // disabled bg-primary button used to render as `opacity-50` over the
  // brand green, which reads as "secondary" rather than "unavailable".
  // `disabled:bg-muted` + `disabled:text-(--fg-disabled)` carry no accent
  // hue in either theme, and beat every variant's own bg-*/text-* utility
  // because the `:disabled` pseudo-class selector outranks a plain class
  // selector on CSS specificity - no !important needed.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-caption font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-muted disabled:text-(--fg-disabled) [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Rests as a tint, goes solid only on :hover - matches the
        // reference's .btn-primary exactly (color:accent/bg:accent-subtle at
        // rest, color:surface/bg:accent on hover), confirmed from its
        // compiled CSS. A saturated filled button should only ever appear
        // transiently under the cursor, never at rest.
        //
        // DO NOT pass `bg-primary` (or any other bg-*) via className to make a
        // button "look primary". The background and the LABEL colour are a
        // matched pair: overriding only the background repaints the fill solid
        // and leaves the label accent-blue, giving blue-on-blue text that is
        // completely unreadable. Five call sites had done exactly this. This
        // variant is already the primary treatment - just use it.
        default:
          "bg-(--brand-accent-subtle) text-(--brand-accent) hover:bg-primary hover:text-primary-foreground",
        // Mirrors .btn-danger: never goes fully solid, even on hover - rest
        // is neutral (bordered, white), hover moves to a subtle red tint.
        destructive:
          "border border-input bg-background text-destructive hover:bg-destructive-subtle hover:text-destructive",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        // Wave 6.3: 44×44 meets Apple HIG + WCAG 2.5.5 touch target size
        // (icon buttons were 40×40, which fails tap reliability on mobile).
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
