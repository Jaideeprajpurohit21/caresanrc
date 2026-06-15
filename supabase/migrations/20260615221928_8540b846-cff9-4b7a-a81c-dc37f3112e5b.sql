CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_pcc_on_scan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM extensions.http_post(
      url := 'https://sxgafxqnzwnnzrfmufdt.supabase.co/functions/v1/notify-pcc-task-complete',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'scan_logs',
        'record', to_jsonb(NEW)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block or fail the scan insert.
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scan_logs_notify_pcc ON public.scan_logs;
CREATE TRIGGER scan_logs_notify_pcc
  AFTER INSERT ON public.scan_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_pcc_on_scan();