import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, X, ChevronDown, LogOut, CreditCard } from "lucide-react";
import { useState } from "react";
import logoPath from "@assets/logo.png";
import PlatformGuide, { featureTooltips } from "./PlatformGuide";

export default function Navbar() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/brands", label: "Brands" },
    { href: "/articles", label: "Articles" },
    { href: "/geo-rankings", label: "Rankings" },
    { href: "/ai-intelligence", label: "AI Intelligence" },
  ];

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3" data-testid="link-logo">
            <img src={logoPath} alt="VentureCite" className="h-14 w-auto" />
          </Link>

          {isAuthenticated && (
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Tooltip key={link.href}>
                  <TooltipTrigger asChild>
                    <Link href={link.href}>
                      <Button
                        variant={location === link.href ? "secondary" : "ghost"}
                        size="sm"
                        className={location === link.href 
                          ? "bg-red-600 text-white hover:bg-red-700" 
                          : "text-gray-300 hover:text-white hover:bg-slate-800"
                        }
                        data-testid={`nav-${link.label.toLowerCase()}`}
                      >
                        {link.label}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px] text-center">
                    {featureTooltips[link.label] || link.label}
                  </TooltipContent>
                </Tooltip>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-slate-800">
                    More <ChevronDown className="ml-1 w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                  <Link href="/ai-visibility"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">AI Visibility Guide</DropdownMenuItem></Link>
                  <Link href="/keyword-research"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Keyword Research</DropdownMenuItem></Link>
                  <Link href="/content"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Content Generator</DropdownMenuItem></Link>
                  <Link href="/publications"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Publications</DropdownMenuItem></Link>
                  <Link href="/geo-tools"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">GEO Tools</DropdownMenuItem></Link>
                  <Link href="/brand-fact-sheet"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Brand Fact Sheet</DropdownMenuItem></Link>
                  <Link href="/agent"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">AI Agent</DropdownMenuItem></Link>
                  <Link href="/community"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Community Engagement</DropdownMenuItem></Link>
                  <Link href="/outreach"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Outreach</DropdownMenuItem></Link>
                  <Link href="/analytics-integrations"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">Analytics Integrations</DropdownMenuItem></Link>
                  <Link href="/ai-traffic"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white">AI Traffic</DropdownMenuItem></Link>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <div className="hidden md:block">
                <PlatformGuide />
              </div>
            )}
            {isLoading ? (
              <div className="w-8 h-8 rounded-full bg-slate-700 animate-pulse" />
            ) : isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-slate-800" data-testid="user-menu">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                      <AvatarFallback className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-slate-700">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <Link href="/pricing"><DropdownMenuItem className="text-gray-200 focus:bg-slate-700 focus:text-white"><CreditCard className="mr-2 h-4 w-4" /> Subscription</DropdownMenuItem></Link>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem onClick={() => logout()} className="text-gray-200 focus:bg-slate-700 focus:text-white" data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <a href="/login">
                  <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-slate-800" data-testid="button-login">
                    Log in
                  </Button>
                </a>
                <a href="/register">
                  <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" data-testid="button-signup">
                    Get Started
                  </Button>
                </a>
              </div>
            )}

            <button
              className="md:hidden p-2 text-gray-300 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && isAuthenticated && (
          <div className="md:hidden py-4 border-t border-slate-800">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <Button
                    variant={location === link.href ? "secondary" : "ghost"}
                    className={`w-full justify-start ${location === link.href 
                      ? "bg-red-600 text-white" 
                      : "text-gray-300 hover:text-white hover:bg-slate-800"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
