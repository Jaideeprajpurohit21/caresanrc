import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMe } from "@/lib/api/rounding.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      const me = await getMe();
      if (!me.isAdmin) throw redirect({ to: "/staff" });
    } catch (e: any) {
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
      throw redirect({ to: "/staff" });
    }
  },
  component: () => <Outlet />,
});
