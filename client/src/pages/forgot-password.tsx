import { useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail, CheckCircle, AlertCircle } from "lucide-react";
import ventureCiteLogo from "@assets/logo.png";
import { Helmet } from "react-helmet-async";

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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">Check your email</CardTitle>
            <CardDescription className="mt-2">
              If an account exists for <span className="font-medium">{email}</span>, you'll receive
              a password reset link shortly.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <Mail className="h-6 w-6 mx-auto text-slate-400 mb-2" />
              <p className="text-sm text-slate-600">
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
          </CardContent>
          <CardFooter className="justify-center">
            <a
              href="/login"
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </a>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <Helmet>
        <title>Reset Password - VentureCite</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={ventureCiteLogo} alt="VentureCite" className="h-12" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Reset your password</CardTitle>
          <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
        </CardHeader>
        <CardContent>
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
              className="w-full bg-red-600 hover:bg-red-700"
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
        </CardContent>
        <CardFooter className="justify-center">
          <a
            href="/login"
            className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </a>
        </CardFooter>
      </Card>
    </div>
  );
}
