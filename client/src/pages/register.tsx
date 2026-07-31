import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { setSession } from "@/lib/authStore";
import { PASSWORD_RULES } from "@shared/passwordPolicy";
import { BrandLogo } from "@/components/BrandLogo";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

// Sessionstorage key that hands the verify-email page the address the
// user just registered with — avoids a query-string param that could
// leak into logs/referrers.
const PENDING_VERIFY_EMAIL_KEY = "venturecite:pending-verify-email";

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const passwordRequirements = PASSWORD_RULES.map((r) => ({
    label: r.label,
    met: r.test(password),
  }));

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const allRequirementsMet = passwordRequirements.every((r) => r.met);

  const registerMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      let result: any = {};
      try {
        result = await response.json();
      } catch {}
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Registration failed (${response.status})`);
      }
      return result;
    },
    onSuccess: async (data) => {
      // Plan 4 Task 3: register no longer issues a session. Instead the
      // server flags requiresVerification and we route the user to the
      // /verify-email screen until they click the link Supabase sent.
      if (data?.requiresVerification) {
        try {
          sessionStorage.setItem(PENDING_VERIFY_EMAIL_KEY, data.email ?? email);
        } catch {
          // sessionStorage may be unavailable (Safari private mode); the
          // verify-email page falls back to a generic message in that
          // case, which is still fine.
        }
        navigate({ to: "/verify-email" });
        return;
      }
      // Legacy path — kept so an older server (or a future flag flip
      // back) still works without breaking the client. Most installs
      // will never hit this branch.
      if (data?.access_token) {
        await setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        queryClient.setQueryData(["/api/auth/me"], data.user);
        toast({ title: "Account created successfully!" });
        navigate({ to: "/" });
      }
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRequirementsMet) {
      toast({ title: "Please meet all password requirements", variant: "destructive" });
      return;
    }
    if (!passwordsMatch) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    registerMutation.mutate({ email, password, firstName, lastName });
  };

  return (
    // Title/robots moved to src/routes/_app/register.tsx's `head()` —
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
            <h1 className="text-page font-semibold text-vc-primary">Create your account</h1>
            <p className="mt-1 text-caption text-vc-tertiary">
              Start optimizing for AI search engines today
            </p>
          </div>
          <div className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>
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
                    placeholder="Create a strong password"
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
                {password && (
                  <ul className="text-caption space-y-1 mt-2">
                    {passwordRequirements.map((req, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-1 ${req.met ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {req.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {req.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  data-testid="input-confirm-password"
                />
                {confirmPassword && !passwordsMatch && (
                  <p className="text-caption text-destructive flex items-center gap-1">
                    <X className="h-3 w-3" /> Passwords do not match
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending || !allRequirementsMet || !passwordsMatch}
                data-testid="button-register"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
              <p className="text-caption text-vc-tertiary text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          </div>
          <div className="mt-6 flex justify-center">
            <p className="text-caption text-vc-tertiary">
              Already have an account?{" "}
              <a
                href="/login"
                className="text-vc-accent hover:text-vc-accent/90 font-medium"
                data-testid="link-login"
              >
                Sign in
              </a>
            </p>
          </div>
        </Panel>
      </PanelRow>
    </PanelPage>
  );
}
