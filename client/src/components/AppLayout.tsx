import { useState } from "react";
import { Link } from "wouter";
import { Menu } from "lucide-react";
import Sidebar, { SidebarContent } from "./Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import logoPath from "@assets/logo.png";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Wave 6.3: skip link for keyboard + screen-reader users. Hidden off-
          screen until focused, then jumps past sidebar nav straight to main. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar />

      <div className="flex-1 min-w-0 lg:ml-[220px]">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-sidebar border-b border-sidebar-border">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/dashboard">
            <img src={logoPath} alt="VentureCite" className="h-8 w-auto cursor-pointer" />
          </Link>
          <div className="w-9" />
        </header>

        <main id="main-content" className="overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
