import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import ventureCiteLogo from "@assets/logo.png";
import { setSession } from "@/lib/authStore";
import { Helmet } from "react-helmet-async";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const passwordRequirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
  ];

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
      await setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      queryClient.setQueryData(["/api/auth/me"], data.user);
      toast({ title: "Account created successfully!" });
      setLocation("/");
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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <Helmet>
        <title>Create Account - VentureCite</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={ventureCiteLogo} alt="VentureCite" className="h-12" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Create your account</CardTitle>
          <CardDescription>Start optimizing for AI search engines today</CardDescription>
        </CardHeader>
        <CardContent>
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
                <ul className="text-xs space-y-1 mt-2">
                  {passwordRequirements.map((req, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-1 ${req.met ? "text-green-600" : "text-slate-500"}`}
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
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <X className="h-3 w-3" /> Passwords do not match
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700"
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
            <p className="text-xs text-slate-500 text-center">
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-slate-600">
            Already have an account?{" "}
            <a
              href="/login"
              className="text-red-600 hover:text-red-700 font-medium"
              data-testid="link-login"
            >
              Sign in
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
