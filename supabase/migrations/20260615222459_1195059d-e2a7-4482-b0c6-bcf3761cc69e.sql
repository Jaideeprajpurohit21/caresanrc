DROP POLICY IF EXISTS "authenticated read rooms" ON public.rooms;

DROP POLICY IF EXISTS "admins read rooms" ON public.rooms;
CREATE POLICY "admins read rooms" ON public.rooms
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));