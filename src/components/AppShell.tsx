import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Building2, DoorOpen, Users, Clock, FileBarChart, ScanLine, Activity, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function AppShell({
  children, isAdmin, fullName,
}: { children: ReactNode; isAdmin: boolean; fullName: string }) {
  const router = useRouter();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  };

  const adminLinks = [
    { to: "/admin", label: "Dashboard", Icon: LayoutDashboard },
    { to: "/admin/facilities", label: "Facilities", Icon: Building2 },
    { to: "/admin/rooms", label: "Rooms & QR", Icon: DoorOpen },
    { to: "/admin/schedule", label: "Schedule", Icon: Clock },
    { to: "/admin/staff", label: "Staff", Icon: Users },
    { to: "/admin/live", label: "Live", Icon: Activity },
    { to: "/admin/reports", label: "Reports", Icon: FileBarChart },
    { to: "/admin/integrations", label: "Integrations", Icon: Plug },
  ] as const;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link to={isAdmin ? "/admin" : "/staff"} className="flex min-w-0 items-center gap-2">
            <ScanLine className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate font-semibold tracking-tight">POC Rounding Portal</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[160px]">{fullName}</span>
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isAdmin && (
          <nav className="border-t bg-card">
            <div className="mx-auto max-w-7xl px-2 overflow-x-auto">
              <ul className="flex gap-1 py-2">
                {adminLinks.map(({ to, label, Icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
                      activeProps={{ className: "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm bg-accent text-accent-foreground font-medium" }}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
