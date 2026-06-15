import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { claimAdminIfNone } from "@/lib/api/rounding.functions";
import { useServerFn } from "@tanstack/react-start";

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const claim = useServerFn(claimAdminIfNone);

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
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // Sign in immediately (email confirm is off by default in Cloud)
        await supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword });
        await claim({}).catch(() => {});
        toast.success("Account created");
        navigate({ to: next as any, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword });
        if (error) throw error;
        await claim({}).catch(() => {});
        navigate({ to: next as any, replace: true });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
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
            {mode === "signin" ? "Sign in to continue" : "Create the first administrator account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create admin account"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {mode === "signin" ? (
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode("signup")}>
                First time here? Create the admin account
              </button>
            ) : (
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode("signin")}>
                Have an account? Sign in
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Only the first signup becomes admin. After that, admins create staff accounts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
