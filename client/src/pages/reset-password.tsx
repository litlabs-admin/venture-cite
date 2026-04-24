import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Check, X, CheckCircle } from "lucide-react";
import ventureCiteLogo from "@assets/logo.png";
import { supabase } from "@/lib/supabase";
import { Helmet } from "react-helmet-async";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
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
        console.warn("[reset-password] getSession failed:", err);
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

  const passwordRequirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
  ];

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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-slate-900">Invalid Reset Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              onClick={() => setLocation("/forgot-password")}
              className="bg-primary hover:bg-primary/90"
            >
              Request new reset link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">Password Reset!</CardTitle>
            <CardDescription className="mt-2">
              Your password has been successfully reset. You can now sign in with your new password.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              onClick={async () => {
                await supabase.auth.signOut();
                setLocation("/login");
              }}
              className="w-full bg-primary hover:bg-primary/90"
              data-testid="button-go-login"
            >
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <Helmet>
        <title>Set New Password - VentureCite</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={ventureCiteLogo} alt="VentureCite" className="h-12" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Set new password</CardTitle>
          <CardDescription>Create a strong password for your account</CardDescription>
        </CardHeader>
        <CardContent>
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
                <ul className="text-xs space-y-1 mt-2">
                  {passwordRequirements.map((req, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-1 ${req.met ? "text-foreground" : "text-slate-500"}`}
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
                <p className="text-xs text-destructive flex items-center gap-1">
                  <X className="h-3 w-3" /> Passwords do not match
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90"
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
        </CardContent>
        <CardFooter className="justify-center">
          <a href="/login" className="text-sm text-slate-600 hover:text-slate-800">
            Remember your password? Sign in
          </a>
        </CardFooter>
      </Card>
    </div>
  );
}
