CREATE OR REPLACE FUNCTION public.submit_round_scan(p_qr_token text)
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
  v_exists      boolean;
  i             int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code','not_authenticated',
      'title','Not signed in', 'message','Please sign in again.');
  END IF;

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

    RETURN jsonb_build_object(
      'ok', true,
      'code','completed',
      'title','You''re checked in!',
      'message','You checked in to Room '||v_room.room_number||'. Thank you for checking in.',
      'room_number', v_room.room_number,
      'round_index', v_open_round,
      'completed_at', v_now,
      'late_minutes', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_open_slot)) / 60))::int
    );
  END IF;

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
$function$;