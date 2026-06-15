
-- ============ DROP LEGACY OBJECTS ============
DROP TABLE IF EXISTS public.scan_logs CASCADE;
DROP TABLE IF EXISTS public.rounding_tasks CASCADE;
DROP TABLE IF EXISTS public.shift_assignments CASCADE;
DROP TABLE IF EXISTS public.shifts CASCADE;
DROP TYPE IF EXISTS public.scan_result CASCADE;
DROP TYPE IF EXISTS public.task_status CASCADE;

-- Floors currently reference units; restructure to facilities
ALTER TABLE public.floors ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.floors f SET facility_id = u.facility_id FROM public.units u WHERE f.unit_id = u.id AND f.facility_id IS NULL;
ALTER TABLE public.floors DROP COLUMN IF EXISTS unit_id;
DROP TABLE IF EXISTS public.units CASCADE;
ALTER TABLE public.floors ALTER COLUMN facility_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.floors ADD CONSTRAINT floors_facility_name_key UNIQUE (facility_id, name);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- ============ EXTEND EXISTING TABLES ============
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Chicago';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL;

-- ============ NEW: round_schedules ============
CREATE TABLE public.round_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  shift_name text NOT NULL,
  shift_start_time time NOT NULL,
  frequency interval NOT NULL DEFAULT '2 hours',
  grace interval NOT NULL DEFAULT '20 minutes',
  rounds_per_shift int NOT NULL CHECK (rounds_per_shift BETWEEN 1 AND 12),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_schedules TO authenticated;
GRANT ALL ON public.round_schedules TO service_role;
ALTER TABLE public.round_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read schedules" ON public.round_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write schedules" ON public.round_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ NEW: scan_logs (immutable compliance record) ============
CREATE TABLE public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.round_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_index int NOT NULL,
  scheduled_for timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  late_minutes int NOT NULL DEFAULT 0,
  shift_label text NOT NULL,
  device_label text,
  UNIQUE (room_id, schedule_id, scheduled_for)
);
CREATE INDEX scan_logs_user_idx ON public.scan_logs(user_id);
CREATE INDEX scan_logs_floor_time_idx ON public.scan_logs(floor_id, scheduled_for);
GRANT SELECT ON public.scan_logs TO authenticated;
GRANT ALL ON public.scan_logs TO service_role;
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;
-- DELIBERATELY no INSERT/UPDATE/DELETE policy: only submit_round_scan (SECURITY DEFINER) writes.
CREATE POLICY "staff read own scans" ON public.scan_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ ANTI-CHEAT ENGINE ============
CREATE OR REPLACE FUNCTION public.submit_round_scan(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  v_exists      boolean;
  i             int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','not_authenticated',
      'title','Not signed in', 'message','Please sign in again.');
  END IF;

  -- Accept token as the qr_token text (or uuid cast)
  BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE qr_token::text = p_qr_token;
  EXCEPTION WHEN others THEN
    v_room := NULL;
  END;
  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','unknown_qr',
      'title','Unrecognized code',
      'message','This QR code is not registered to any active room.');
  END IF;

  SELECT * INTO v_schedule FROM public.round_schedules
    WHERE floor_id = v_room.floor_id AND active = true
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code','no_schedule',
      'title','No active schedule',
      'message','This floor has no active rounding schedule.');
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
      'message','There is no active shift for this floor right now.');
  END IF;

  -- Find an open slot for this room
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
        'message','This round for Room '||v_room.room_number||' was already recorded.');
    END IF;

    INSERT INTO public.scan_logs
      (room_id, floor_id, schedule_id, user_id, round_index,
       scheduled_for, completed_at, late_minutes, shift_label)
    VALUES
      (v_room.id, v_room.floor_id, v_schedule.id, v_user_id, v_open_round,
       v_open_slot, v_now,
       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_open_slot)) / 60))::int,
       v_schedule.shift_name);

    RETURN jsonb_build_object('ok', true, 'code','completed',
      'title','Round Completed Successfully',
      'room_number', v_room.room_number,
      'round_index', v_open_round,
      'completed_at', v_now);
  END IF;

  -- No open slot: check if most-recently-closed slot was missed
  v_last_closed_slot := NULL;
  FOR i IN 1..v_schedule.rounds_per_shift LOOP
    v_slot     := v_anchor + v_schedule.frequency * i;
    v_slot_end := v_slot + v_schedule.grace;
    IF v_now > v_slot_end THEN
      v_last_closed_slot := v_slot;
    END IF;
  END LOOP;

  IF v_last_closed_slot IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.scan_logs
      WHERE room_id = v_room.id AND schedule_id = v_schedule.id AND scheduled_for = v_last_closed_slot
    ) INTO v_exists;
    IF NOT v_exists THEN
      RETURN jsonb_build_object('ok', false, 'code','expired',
        'title','This task window has expired',
        'message','The most recent round for Room '||v_room.room_number||' has closed and is recorded as missed.');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', false, 'code','not_due',
    'title','Next round is not due yet',
    'message','The next round for Room '||v_room.room_number||' has not opened yet. Try again shortly.');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_round_scan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_round_scan(text) TO authenticated;

-- ============ READ: floor status ============
CREATE OR REPLACE FUNCTION public.get_floor_status(p_floor_id uuid)
RETURNS TABLE (
  room_id uuid,
  room_number text,
  status text,
  round_index int,
  scheduled_for timestamptz,
  completed_at timestamptz,
  completed_by text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH sched AS (
    SELECT * FROM public.round_schedules
    WHERE floor_id = p_floor_id AND active = true
    ORDER BY created_at DESC LIMIT 1
  ),
  fac AS (
    SELECT f.* FROM public.facilities f
    JOIN public.floors fl ON fl.facility_id = f.id WHERE fl.id = p_floor_id
  ),
  anchor AS (
    SELECT CASE
      WHEN now() BETWEEN
        (((date_trunc('day', now() AT TIME ZONE fac.timezone))::date + sched.shift_start_time) AT TIME ZONE fac.timezone)
        AND
        (((date_trunc('day', now() AT TIME ZONE fac.timezone))::date + sched.shift_start_time) AT TIME ZONE fac.timezone)
          + (sched.frequency * sched.rounds_per_shift + sched.grace)
      THEN (((date_trunc('day', now() AT TIME ZONE fac.timezone))::date + sched.shift_start_time) AT TIME ZONE fac.timezone)
      ELSE (((date_trunc('day', now() AT TIME ZONE fac.timezone))::date - 1 + sched.shift_start_time) AT TIME ZONE fac.timezone)
    END AS a
    FROM sched, fac
  ),
  slots AS (
    SELECT g AS round_index,
           anchor.a + sched.frequency * g AS slot,
           anchor.a + sched.frequency * g + sched.grace AS slot_end
    FROM sched, anchor, generate_series(1, sched.rounds_per_shift) g
  ),
  ranked AS (
    SELECT r.id AS room_id, r.room_number, s.round_index, s.slot, s.slot_end,
           row_number() OVER (
             PARTITION BY r.id
             ORDER BY
               CASE WHEN now() BETWEEN s.slot AND s.slot_end THEN 0
                    WHEN now() < s.slot THEN 1
                    ELSE 2 END,
               s.slot
           ) AS rk
    FROM public.rooms r
    CROSS JOIN slots s
    WHERE r.floor_id = p_floor_id
  )
  SELECT
    ranked.room_id,
    ranked.room_number,
    CASE
      WHEN sl.id IS NOT NULL THEN 'completed'
      WHEN now() BETWEEN ranked.slot AND ranked.slot_end THEN 'active'
      WHEN now() < ranked.slot THEN 'upcoming'
      ELSE 'overdue'
    END AS status,
    ranked.round_index,
    ranked.slot AS scheduled_for,
    sl.completed_at,
    p.full_name AS completed_by
  FROM ranked
  LEFT JOIN public.scan_logs sl
    ON sl.room_id = ranked.room_id AND sl.scheduled_for = ranked.slot
  LEFT JOIN public.profiles p ON p.id = sl.user_id
  WHERE ranked.rk = 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_floor_status(uuid) TO authenticated;

-- ============ READ: round report (real impl) ============
CREATE OR REPLACE FUNCTION public.get_round_report(
  p_floor_id uuid,
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  room_id uuid,
  room_number text,
  round_index int,
  scheduled_for timestamptz,
  completed_at timestamptz,
  status text,
  late_minutes int,
  employee_name text,
  employee_id text,
  shift_label text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH sched AS (
    SELECT * FROM public.round_schedules
    WHERE floor_id = p_floor_id AND active = true
    ORDER BY created_at DESC LIMIT 1
  ),
  fac AS (
    SELECT f.* FROM public.facilities f
    JOIN public.floors fl ON fl.facility_id = f.id WHERE fl.id = p_floor_id
  ),
  -- Generate every shift anchor whose window overlaps [p_from, p_to]
  days AS (
    SELECT generate_series(
      (p_from AT TIME ZONE (SELECT timezone FROM fac))::date - 1,
      (p_to   AT TIME ZONE (SELECT timezone FROM fac))::date + 1,
      interval '1 day'
    )::date AS d
  ),
  anchors AS (
    SELECT ((days.d + sched.shift_start_time) AT TIME ZONE fac.timezone) AS a
    FROM days, sched, fac
  ),
  slots AS (
    SELECT a + sched.frequency * g AS slot,
           a + sched.frequency * g + sched.grace AS slot_end,
           g AS round_index
    FROM anchors, sched, generate_series(1, sched.rounds_per_shift) g
  ),
  filtered AS (
    SELECT * FROM slots WHERE slot BETWEEN p_from AND p_to
  ),
  matrix AS (
    SELECT r.id AS room_id, r.room_number, f.round_index, f.slot, f.slot_end
    FROM public.rooms r CROSS JOIN filtered f
    WHERE r.floor_id = p_floor_id
  )
  SELECT
    m.room_id, m.room_number, m.round_index, m.slot,
    sl.completed_at,
    CASE
      WHEN sl.id IS NOT NULL THEN 'completed'
      WHEN now() > m.slot_end THEN 'overdue'
      ELSE 'upcoming'
    END AS status,
    COALESCE(sl.late_minutes, 0),
    p.full_name, p.employee_id, (SELECT shift_name FROM sched)
  FROM matrix m
  LEFT JOIN public.scan_logs sl ON sl.room_id = m.room_id AND sl.scheduled_for = m.slot
  LEFT JOIN public.profiles p ON p.id = sl.user_id
  ORDER BY m.slot, m.room_number;
$$;
GRANT EXECUTE ON FUNCTION public.get_round_report(uuid, timestamptz, timestamptz) TO authenticated;

-- ============ SEED (only if empty) ============
DO $seed$
DECLARE v_fac uuid; v_floor uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.facilities) THEN
    INSERT INTO public.facilities (name, timezone) VALUES ('St. Anthony''s Nursing & Rehab', 'America/Chicago') RETURNING id INTO v_fac;
    INSERT INTO public.floors (facility_id, name) VALUES (v_fac, '2nd Floor — Memory Care') RETURNING id INTO v_floor;
    INSERT INTO public.rooms (floor_id, room_number) VALUES
      (v_floor,'101'),(v_floor,'102'),(v_floor,'103'),(v_floor,'104'),(v_floor,'105'),(v_floor,'106');
    INSERT INTO public.round_schedules (floor_id, shift_name, shift_start_time, frequency, grace, rounds_per_shift)
      VALUES (v_floor, 'Night', '22:00', interval '2 hours', interval '20 minutes', 5);
  END IF;
END $seed$;
