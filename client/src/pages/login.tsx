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
import { Eye, EyeOff, Loader2 } from "lucide-react";
import ventureCiteLogo from "@assets/logo.png";
import { setSession } from "@/lib/authStore";
import { Helmet } from "react-helmet-async";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      setLocation("/");
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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <Helmet>
        <title>Sign In - VentureCite</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={ventureCiteLogo} alt="VentureCite" className="h-12" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Welcome back</CardTitle>
          <CardDescription>Sign in to your VentureCite account</CardDescription>
        </CardHeader>
        <CardContent>
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
                className="text-sm text-red-600 hover:text-red-700"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </a>
            </div>
            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700"
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
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-slate-600">
            Don't have an account?{" "}
            <a
              href="/register"
              className="text-red-600 hover:text-red-700 font-medium"
              data-testid="link-register"
            >
              Sign up
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
