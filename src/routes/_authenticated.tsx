import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/api/rounding.functions";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: undefined } });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const me = useServerFn(getMe);
  const { data } = useSuspenseQuery({
    queryKey: ["me"],
    queryFn: () => me({}),
    staleTime: 60_000,
  });
  return (
    <AppShell isAdmin={data.isAdmin} fullName={data.profile?.full_name || data.profile?.email || ""}>
      <Outlet />
    </AppShell>
  );
}
