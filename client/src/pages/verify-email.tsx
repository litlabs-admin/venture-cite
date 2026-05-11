import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, Loader2, Mail } from "lucide-react";
import { Helmet } from "react-helmet-async";

// Post-register "check your email" screen. Register.tsx drops the
// pending email in sessionStorage and routes here; the resend button
// hits POST /api/auth/resend-verification and is throttled client-side
// by a 60-second cooldown (server enforces the real 60s gap + 3/hour
// cap anyway, but the visual disable prevents users from spamming the
// button while a request is in-flight).
//
// When sessionStorage is unavailable (Safari private mode) or cleared
// (user closed the tab, navigated here directly), we fall back to a
// manual email input so the user can still resend.

const PENDING_VERIFY_EMAIL_KEY = "venturecite:pending-verify-email";
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_RE = /\S+@\S+\.\S+/;

export default function VerifyEmail() {
  const { toast } = useToast();
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [typedEmail, setTypedEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PENDING_VERIFY_EMAIL_KEY);
      if (stored) setStoredEmail(stored);
    } catch {
      // sessionStorage unavailable (Safari private mode); fall through to manual input
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const emailToUse = (storedEmail ?? typedEmail).trim();
  const isValidEmail = EMAIL_RE.test(emailToUse);

  const resendMutation = useMutation({
    mutationFn: async () => {
      if (!emailToUse || !isValidEmail) {
        throw new Error("Please enter a valid email address.");
      }
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToUse }),
      });
      let result: any = {};
      try {
        result = await response.json();
      } catch {}
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Request failed (${response.status})`);
      }
      return result;
    },
    onSuccess: () => {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast({ title: "Verification email sent", description: "Check your inbox in a moment." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not resend", description: error.message, variant: "destructive" });
    },
  });

  const canResend = isValidEmail && cooldown === 0 && !resendMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Helmet>
        <title>Verify your email - VentureCite</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-chart-4" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Check your email</CardTitle>
          <CardDescription className="mt-2">
            {storedEmail ? (
              <>
                We sent a verification link to <span className="font-medium">{storedEmail}</span>.
                Click it to finish setting up your account.
              </>
            ) : (
              <>
                We sent a verification link to the email you registered with. Click it to finish
                setting up your account.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="bg-muted rounded-lg p-4 mb-4">
            <Mail className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Don't see the email? Check your spam folder, or resend the link below.
            </p>
          </div>
          {!storedEmail && (
            <div className="space-y-2 text-left mb-4">
              <Label htmlFor="resend-email" className="text-sm">
                Enter your email to resend the verification link
              </Label>
              <Input
                id="resend-email"
                type="email"
                placeholder="you@example.com"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
                data-testid="input-resend-email"
              />
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            disabled={!canResend}
            onClick={() => resendMutation.mutate()}
            data-testid="button-resend-verification"
          >
            {resendMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              "Resend verification email"
            )}
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            Already verified?{" "}
            <a
              href="/login"
              className="text-primary hover:text-primary/90 font-medium"
              data-testid="link-already-verified-signin"
            >
              Sign in
            </a>
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <a
            href="/login"
            className="text-sm text-primary hover:text-primary/90 flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </a>
        </CardFooter>
      </Card>
    </div>
  );
}
