import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const forgotMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
      setErrorMessage("");
      setSubmitted(true);
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      toast({ title: "Reset email failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forgotMutation.mutate(email);
  };

  if (submitted) {
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
              <h1 className="text-page font-semibold text-vc-primary">Check your email</h1>
              <p className="mt-2 text-caption text-vc-tertiary">
                If an account exists for <span className="font-medium">{email}</span>, you'll
                receive a password reset link shortly.
              </p>
            </div>
            <div className="mt-6 text-center">
              <div className="bg-vc-muted rounded-lg p-4 mb-4">
                <Mail className="h-6 w-6 mx-auto text-vc-tertiary mb-2" />
                <p className="text-caption text-vc-tertiary">
                  Don't see the email? Check your spam folder or try again.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSubmitted(false);
                  setEmail("");
                }}
                data-testid="button-try-again"
              >
                Try a different email
              </Button>
            </div>
            <div className="mt-6 flex justify-center">
              <a
                href="/login"
                className="text-caption text-vc-accent hover:text-vc-accent/90 flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </a>
            </div>
          </Panel>
        </PanelRow>
      </PanelPage>
    );
  }

  return (
    // Title/robots moved to src/routes/_app/forgot-password.tsx's `head()`
    // — metadata belongs to the route, not this component.
    <PanelPage className="flex items-center justify-center p-4">
      <PanelRow cols={1} last className="w-full max-w-md">
        <Panel width="wide" border="last">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <BrandLogo imgClassName="h-12" textClassName="text-page" />
            </div>
            <h1 className="text-page font-semibold text-vc-primary">Reset your password</h1>
            <p className="mt-1 text-caption text-vc-tertiary">
              Enter your email and we'll send you a reset link
            </p>
          </div>
          <div className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <Alert variant="destructive" data-testid="alert-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
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
              <Button
                type="submit"
                className="w-full"
                disabled={forgotMutation.isPending}
                data-testid="button-send-reset"
              >
                {forgotMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          </div>
          <div className="mt-6 flex justify-center">
            <a
              href="/login"
              className="text-caption text-vc-accent hover:text-vc-accent/90 flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </a>
          </div>
        </Panel>
      </PanelRow>
    </PanelPage>
  );
}
