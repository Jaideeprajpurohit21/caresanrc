import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listStaff, createStaff, setStaffActive, resetStaffPassword } from "@/lib/api/rounding.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({ meta: [{ title: "Staff — Admin" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const setActive = useServerFn(setStaffActive);
  const reset = useServerFn(resetStaffPassword);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: ["staff"], queryFn: () => fn({}) });

  const [form, setForm] = useState({ email: "", password: "", full_name: "", employee_id: "", role: "staff" as "staff" | "admin" });
  const add = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => {
      toast.success("Staff member created");
      setForm({ email: "", password: "", full_name: "", employee_id: "", role: "staff" });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Staff</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Add staff member</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Employee ID</Label><Input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Temporary password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff (CNA / Caregiver)</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button className="w-full" disabled={add.isPending || !form.email || form.password.length < 8 || !form.full_name} onClick={() => add.mutate()}>Create account</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">All staff</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(data ?? []).map((s: any) => {
              const roles = (s.user_roles ?? []).map((r: any) => r.role);
              return (
                <li key={s.id} className="py-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">{s.full_name || s.email} {roles.includes("admin") && <Badge>admin</Badge>} {!s.active && <Badge variant="destructive">inactive</Badge>}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.email} {s.employee_id ? `· #${s.employee_id}` : ""}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={async () => {
                      const pw = prompt(`New password for ${s.full_name || s.email}? (min 8 chars)`);
                      if (!pw || pw.length < 8) return;
                      try { await reset({ data: { id: s.id, password: pw } }); toast.success("Password reset"); }
                      catch (e: any) { toast.error(e.message); }
                    }}>Reset password</Button>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      await setActive({ data: { id: s.id, active: !s.active } });
                      qc.invalidateQueries({ queryKey: ["staff"] });
                    }}>{s.active ? "Deactivate" : "Reactivate"}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
