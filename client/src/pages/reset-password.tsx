import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Check, X, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Sentry } from "@/lib/sentry";
import { PASSWORD_RULES } from "@shared/passwordPolicy";
import { BrandLogo } from "@/components/BrandLogo";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Supabase parses the recovery token from the URL hash and sets a session
  // automatically (detectSessionInUrl: true). We just wait for it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setHasSession(!!data.session);
      } catch (err) {
        if (cancelled) return;
        Sentry.captureException(err, { tags: { source: "reset-password.getSession" } });
        setHasSession(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(!!session);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const passwordRequirements = PASSWORD_RULES.map((r) => ({
    label: r.label,
    met: r.test(password),
  }));

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const allRequirementsMet = passwordRequirements.every((r) => r.met);

  const resetMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSuccess(true);
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
    resetMutation.mutate(password);
  };

  if (hasSession === false) {
    return (
      <PanelPage className="flex items-center justify-center p-4">
        <PanelRow cols={1} last className="w-full max-w-md">
          <Panel width="wide" border="last">
            <div className="text-center">
              <h1 className="text-page font-semibold text-vc-primary">Invalid Reset Link</h1>
              <p className="mt-1 text-caption text-vc-tertiary">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>
            <div className="mt-6 text-center">
              <Button onClick={() => navigate({ to: "/forgot-password" })}>
                Request new reset link
              </Button>
            </div>
          </Panel>
        </PanelRow>
      </PanelPage>
    );
  }

  if (success) {
    return (
      <PanelPage className="flex items-center justify-center p-4">
        <PanelRow cols={1} last className="w-full max-w-md">
          <Panel width="wide" border="last">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 bg-vc-muted rounded-full flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-vc-primary" />
                </div>
              </div>
              <h1 className="text-page font-semibold text-vc-primary">Password Reset!</h1>
              <p className="mt-2 text-caption text-vc-tertiary">
                Your password has been successfully reset. You can now sign in with your new
                password.
              </p>
            </div>
            <div className="mt-6 text-center">
              <Button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/login" });
                }}
                className="w-full"
                data-testid="button-go-login"
              >
                Go to sign in
              </Button>
            </div>
          </Panel>
        </PanelRow>
      </PanelPage>
    );
  }

  return (
    // Title/robots moved to src/routes/_app/reset-password.tsx's `head()`
    // - metadata belongs to the route, not this component.
    <PanelPage className="flex items-center justify-center p-4">
      <PanelRow cols={1} last className="w-full max-w-md">
        <Panel width="wide" border="last">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <BrandLogo imgClassName="h-12" textClassName="text-page" />
            </div>
            <h1 className="text-page font-semibold text-vc-primary">Set new password</h1>
            <p className="mt-1 text-caption text-vc-tertiary">
              Create a strong password for your account
            </p>
          </div>
          <div className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
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
                <Label htmlFor="confirmPassword">Confirm new password</Label>
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
                disabled={
                  resetMutation.isPending ||
                  !allRequirementsMet ||
                  !passwordsMatch ||
                  hasSession !== true
                }
                data-testid="button-reset-password"
              >
                {resetMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  "Reset password"
                )}
              </Button>
            </form>
          </div>
          <div className="mt-6 flex justify-center">
            <a href="/login" className="text-caption text-vc-tertiary hover:text-vc-primary">
              Remember your password? Sign in
            </a>
          </div>
        </Panel>
      </PanelRow>
    </PanelPage>
  );
}
