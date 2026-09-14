CREATE OR REPLACE FUNCTION public.normalize_tag_uid(p_uid text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT lower(regexp_replace(coalesce(p_uid,''), '[^0-9a-zA-Z]', '', 'g')) $$;

CREATE TABLE IF NOT EXISTS public.room_nfc_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  tag_uid text NOT NULL,
  tag_uid_normalized text GENERATED ALWAYS AS (lower(regexp_replace(tag_uid, '[^0-9a-zA-Z]', '', 'g'))) STORED,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS room_nfc_tags_uid_key ON public.room_nfc_tags (tag_uid_normalized);
CREATE INDEX IF NOT EXISTS room_nfc_tags_room_idx ON public.room_nfc_tags (room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_nfc_tags TO authenticated;
GRANT ALL ON public.room_nfc_tags TO service_role;

ALTER TABLE public.room_nfc_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage facility nfc tags" ON public.room_nfc_tags
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') AND room_id IN (
    SELECT r.id FROM public.rooms r JOIN public.floors fl ON fl.id = r.floor_id
    WHERE fl.facility_id = (SELECT p.facility_id FROM public.profiles p WHERE p.id = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND room_id IN (
    SELECT r.id FROM public.rooms r JOIN public.floors fl ON fl.id = r.floor_id
    WHERE fl.facility_id = (SELECT p.facility_id FROM public.profiles p WHERE p.id = auth.uid())
  )
);

CREATE POLICY "staff read facility nfc tags" ON public.room_nfc_tags
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'staff') AND room_id IN (
    SELECT r.id FROM public.rooms r JOIN public.floors fl ON fl.id = r.floor_id
    WHERE fl.facility_id = (SELECT p.facility_id FROM public.profiles p WHERE p.id = auth.uid())
  )
);

CREATE TRIGGER touch_room_nfc_tags_updated_at
BEFORE UPDATE ON public.room_nfc_tags
FOR EACH ROW EXECUTE FUNCTION public.touch_pcc_task_links_updated_at();

CREATE OR REPLACE FUNCTION public.submit_round_scan(
  p_qr_token text,
  p_dry_run boolean DEFAULT false,
  p_input_method text DEFAULT 'qr'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_room        public.rooms%rowtype;
  v_schedule    public.round_schedules%rowtype;
  v_facility    public.facilities%rowtype;
  v_now         timestamptz := now();
  v_window      interval;
  v_anchor      timestamptz;
  v_slot        timestamptz;
  v_slot_end    timestamptz;
  v_open_slot   timestamptz;
  v_open_round  int;
  v_last_closed_slot timestamptz;
  v_next_slot   timestamptz;
  v_exists      boolean;
  v_method      text := COALESCE(NULLIF(p_input_method, ''), 'qr');
  v_norm        text;
  v_room_id     uuid;
  i             int;
BEGIN
  IF v_method NOT IN ('qr','nfc') THEN v_method := 'qr'; END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','not_authenticated',
      'title','Not signed in', 'message','Please sign in again.', 'dry_run', p_dry_run);
  END IF;

  BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE qr_token::text = p_qr_token;
  EXCEPTION WHEN others THEN
    v_room := NULL;
  END;

  IF v_room.id IS NULL THEN
    v_norm := public.normalize_tag_uid(p_qr_token);
    IF v_norm <> '' THEN
      SELECT t.room_id INTO v_room_id FROM public.room_nfc_tags t
        WHERE t.tag_uid_normalized = v_norm LIMIT 1;
      IF v_room_id IS NOT NULL THEN
        SELECT * INTO v_room FROM public.rooms WHERE id = v_room_id;
      END IF;
    END IF;
  END IF;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','unlinked_tag',
      'title','Tag not linked to a room',
      'message','This tag or code isn''t linked to a room yet — ask an administrator to link it.',
      'tag_uid', p_qr_token,
      'dry_run', p_dry_run);
  END IF;

  SELECT * INTO v_schedule FROM public.round_schedules
    WHERE floor_id = v_room.floor_id AND active = true
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','no_schedule',
      'title','No active schedule',
      'message','This floor has no active rounding schedule.',
      'dry_run', p_dry_run);
  END IF;

  SELECT f.* INTO v_facility FROM public.facilities f
    JOIN public.floors fl ON fl.facility_id = f.id
    WHERE fl.id = v_room.floor_id;

  v_window := v_schedule.frequency * v_schedule.rounds_per_shift + v_schedule.grace;

  IF v_now BETWEEN
       (((date_trunc('day', v_now AT TIME ZONE v_facility.timezone))::date + v_schedule.shift_start_time) AT TIME ZONE v_facility.timezone)
     AND
       (((date_trunc('day', v_now AT TIME ZONE v_facility.timezone))::date + v_schedule.shift_start_time) AT TIME ZONE v_facility.timezone) + v_window
  THEN
    v_anchor := (((date_trunc('day', v_now AT TIME ZONE v_facility.timezone))::date + v_schedule.shift_start_time) AT TIME ZONE v_facility.timezone);
  ELSIF v_now BETWEEN
       (((date_trunc('day', v_now AT TIME ZONE v_facility.timezone))::date - 1 + v_schedule.shift_start_time) AT TIME ZONE v_facility.timezone)
     AND
       (((date_trunc('day', v_now AT TIME ZONE v_facility.timezone))::date - 1 + v_schedule.shift_start_time) AT TIME ZONE v_facility.timezone) + v_window
  THEN
    v_anchor := (((date_trunc('day', v_now AT TIME ZONE v_facility.timezone))::date - 1 + v_schedule.shift_start_time) AT TIME ZONE v_facility.timezone);
  ELSE
    RETURN jsonb_build_object('ok', false, 'code','off_shift',
      'title','No shift in progress',
      'message','There is no active shift for this floor right now.',
      'dry_run', p_dry_run);
  END IF;

  FOR i IN 1..v_schedule.rounds_per_shift LOOP
    v_slot     := v_anchor + v_schedule.frequency * i;
    v_slot_end := v_slot + v_schedule.grace;
    IF v_now BETWEEN v_slot AND v_slot_end THEN
      v_open_slot := v_slot;
      v_open_round := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_open_slot IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.scan_logs
      WHERE room_id = v_room.id AND schedule_id = v_schedule.id AND scheduled_for = v_open_slot
    ) INTO v_exists;

    IF v_exists THEN
      RETURN jsonb_build_object('ok', false, 'code','already_done',
        'title','Already completed',
        'message','This round for Room '||v_room.room_number||' was already recorded.',
        'dry_run', p_dry_run);
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO public.scan_logs
        (room_id, floor_id, schedule_id, user_id, round_index,
         scheduled_for, completed_at, late_minutes, shift_label, input_method)
      VALUES
        (v_room.id, v_room.floor_id, v_schedule.id, v_user_id, v_open_round,
         v_open_slot, v_now,
         GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_open_slot)) / 60))::int,
         v_schedule.shift_name, v_method);
    END IF;

    v_next_slot := NULL;
    FOR i IN 1..v_schedule.rounds_per_shift LOOP
      v_slot := v_anchor + v_schedule.frequency * i;
      IF v_slot > v_now AND v_next_slot IS NULL THEN v_next_slot := v_slot; END IF;
    END LOOP;
    IF v_next_slot IS NULL THEN
      v_next_slot := v_anchor + interval '1 day' + v_schedule.frequency;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'code','completed',
      'title','Scan completed',
      'message','You checked in to Room '||v_room.room_number||
                '. Next scan is scheduled at '||
                to_char(v_next_slot AT TIME ZONE v_facility.timezone, 'HH12:MI AM')||'.',
      'room_number', v_room.room_number,
      'round_index', v_open_round,
      'completed_at', v_now,
      'next_window_starts', v_next_slot,
      'late_minutes', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_open_slot)) / 60))::int,
      'dry_run', p_dry_run
    );
  END IF;

  v_last_closed_slot := NULL;
  v_next_slot := NULL;
  FOR i IN 1..v_schedule.rounds_per_shift LOOP
    v_slot     := v_anchor + v_schedule.frequency * i;
    v_slot_end := v_slot + v_schedule.grace;
    IF v_now > v_slot_end THEN
      v_last_closed_slot := v_slot;
    END IF;
    IF v_now < v_slot AND v_next_slot IS NULL THEN
      v_next_slot := v_slot;
    END IF;
  END LOOP;

  IF v_next_slot IS NULL THEN
    v_next_slot := v_anchor + interval '1 day' + v_schedule.frequency;
  END IF;

  IF v_last_closed_slot IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.scan_logs
      WHERE room_id = v_room.id AND schedule_id = v_schedule.id AND scheduled_for = v_last_closed_slot
    ) INTO v_exists;
    IF NOT v_exists THEN
      RETURN jsonb_build_object('ok', false, 'code','expired',
        'title','This task window has expired',
        'message','The most recent round for Room '||v_room.room_number||
                  ' has closed and is recorded as missed. Next round opens at '||
                  to_char(v_next_slot AT TIME ZONE v_facility.timezone, 'HH12:MI AM')||'.',
        'next_window_starts', v_next_slot,
        'dry_run', p_dry_run);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', false, 'code','not_due',
    'title','Next round is not due yet',
    'message','The next round for Room '||v_room.room_number||
              ' opens at '||to_char(v_next_slot AT TIME ZONE v_facility.timezone, 'HH12:MI AM')||'.',
    'next_window_starts', v_next_slot,
    'dry_run', p_dry_run);
END;
$function$;