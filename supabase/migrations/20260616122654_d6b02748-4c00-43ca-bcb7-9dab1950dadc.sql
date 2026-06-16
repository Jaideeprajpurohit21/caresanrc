CREATE TABLE public.scan_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  qr_token text,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  code text NOT NULL,
  title text,
  message text,
  dry_run boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scan_error_logs TO authenticated;
GRANT ALL ON public.scan_error_logs TO service_role;

ALTER TABLE public.scan_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scan error logs"
  ON public.scan_error_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX scan_error_logs_created_at_idx ON public.scan_error_logs (created_at DESC);
CREATE INDEX scan_error_logs_code_idx ON public.scan_error_logs (code);