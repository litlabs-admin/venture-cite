import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Segmented control, matching the dashboard's own range switcher
      // (command-center/VisibilityChart) and the sidebar's active nav item:
      // hairline container on white, active item is an accent TINT — not the
      // stock shadcn gray trough with a white drop-shadowed chip.
      "inline-flex h-8 items-center justify-center rounded border border-vc-default bg-vc-surface p-0.5 text-vc-secondary",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-[3px] px-2.5 py-1 text-caption font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-vc-accent/40 disabled:pointer-events-none disabled:opacity-50",
      "hover:bg-vc-muted/40 hover:text-vc-primary",
      "data-[state=active]:bg-vc-accent-subtle data-[state=active]:text-vc-accent data-[state=active]:hover:bg-vc-accent-subtle",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
