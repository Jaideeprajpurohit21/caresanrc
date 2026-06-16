DROP POLICY IF EXISTS "staff read facility rooms" ON public.rooms;

CREATE POLICY "staff read facility rooms"
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff')
    AND floor_id IN (
      SELECT floors.id FROM public.floors
      WHERE floors.facility_id = (
        SELECT profiles.facility_id FROM public.profiles WHERE profiles.id = auth.uid()
      )
    )
  );