import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/api/rounding.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "POC Rounding Portal" },
      { name: "description", content: "Anti-cheating QR rounding for nursing homes and assisted living facilities." },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const me = useServerFn(getMe);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/auth", replace: true }); return; }
      const profile = await me({}).catch(() => null);
      if (profile?.isAdmin) navigate({ to: "/admin", replace: true });
      else navigate({ to: "/staff", replace: true });
    })();
  }, [me, navigate]);
  return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
}
