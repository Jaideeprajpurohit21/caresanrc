CREATE TABLE IF NOT EXISTS public.pcc_task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  pcc_patient_id text,
  pcc_task_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pcc_task_links TO authenticated;
GRANT ALL ON public.pcc_task_links TO service_role;

ALTER TABLE public.pcc_task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage pcc links" ON public.pcc_task_links
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND room_id IN (
      SELECT r.id FROM public.rooms r
      JOIN public.floors fl ON fl.id = r.floor_id
      WHERE fl.facility_id = (SELECT facility_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND room_id IN (
      SELECT r.id FROM public.rooms r
      JOIN public.floors fl ON fl.id = r.floor_id
      WHERE fl.facility_id = (SELECT facility_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.touch_pcc_task_links_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS pcc_task_links_set_updated_at ON public.pcc_task_links;
CREATE TRIGGER pcc_task_links_set_updated_at
  BEFORE UPDATE ON public.pcc_task_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_pcc_task_links_updated_at();