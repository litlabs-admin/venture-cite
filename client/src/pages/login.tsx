import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { setSession } from "@/lib/authStore";
import { BrandLogo } from "@/components/BrandLogo";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      setJustVerified(true);
      // Strip the query param so a refresh doesn't replay the banner.
      const url = new URL(window.location.href);
      url.searchParams.delete("verified");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      let result: any = {};
      try {
        result = await response.json();
      } catch {}
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Login failed (${response.status})`);
      }
      return result;
    },
    onSuccess: async (data) => {
      await setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      queryClient.setQueryData(["/api/auth/me"], data.user);
      toast({ title: "Welcome back!" });
      navigate({ to: "/" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  return (
    // Title/robots moved to src/routes/_app/login.tsx's `head()` -
    // metadata belongs to the route, not this component.
    <PanelPage className="flex items-center justify-center p-4">
      <PanelRow cols={1} last className="w-full max-w-md">
        <Panel width="wide" border="last" className="relative">
          <a
            href="/"
            className="absolute top-3 left-3 text-caption text-vc-tertiary hover:text-vc-primary transition-colors"
            data-testid="link-back-home"
          >
            ← Back to home
          </a>
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <BrandLogo imgClassName="h-12" textClassName="text-page" />
            </div>
            <h1 className="text-page font-semibold text-vc-primary">Welcome back</h1>
            <p className="mt-1 text-caption text-vc-tertiary">
              Sign in to your VentureCite account
            </p>
          </div>
          <div className="mt-6">
            {justVerified && (
              <Alert className="mb-4 bg-muted">
                <CheckCircle2 className="h-4 w-4 text-foreground" />
                <AlertDescription>Email verified. Please sign in to continue.</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <a
                  href="/forgot-password"
                  className="text-caption text-primary hover:text-primary/90"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </a>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>
          <div className="mt-6 flex justify-center">
            <p className="text-caption text-vc-tertiary">
              Don't have an account?{" "}
              <a
                href="/register"
                className="text-vc-accent hover:text-vc-accent/90 font-medium"
                data-testid="link-register"
              >
                Sign up
              </a>
            </p>
          </div>
        </Panel>
      </PanelRow>
    </PanelPage>
  );
}
