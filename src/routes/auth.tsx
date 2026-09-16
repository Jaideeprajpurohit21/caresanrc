import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScanLine, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — POC Rounding Portal" },
      { name: "description", content: "Sign in to the POC Rounding Portal for nursing-home rounding." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/";
  // Only allow same-origin path redirects (must start with single slash, no protocol).
  if (!/^\/[^/]/.test(target) && target !== "/") return "/";
  return target;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const next = safeRedirect(search.redirect);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: next as any, replace: true });
    });
  }, [navigate, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();
      if (normalizedPassword.length < 8) throw new Error("Password must be at least 8 characters");
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword });
      if (error) throw error;
      // Drop any data cached for a previously signed-in user before rendering the app.
      await queryClient.cancelQueries();
      queryClient.clear();
      navigate({ to: next as any, replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error("Enter your email address");
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Reset link sent");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send the reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto h-10 w-10 grid place-items-center rounded-lg bg-primary/10 text-primary">
            <ScanLine className="h-6 w-6" />
          </div>
          <CardTitle>POC Rounding Portal</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Sign in to continue" : "Reset your password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "signin" ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="current-password"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Please wait…" : "Login"}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setSent(false);
                    setMode("forgot");
                  }}
                >
                  Forgot Password?
                </button>
              </div>
            </>
          ) : sent ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                If that email belongs to an account, a password-reset link is on its way. The link works once and expires
                after a short time.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setMode("signin")}>
                Return to Login
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleForgot} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Registered email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm">
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode("signin")}>
                  Back to sign in
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
