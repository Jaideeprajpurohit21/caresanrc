export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      facilities: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      floors: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      pcc_task_links: {
        Row: {
          created_at: string
          id: string
          pcc_patient_id: string | null
          pcc_task_id: string | null
          room_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pcc_patient_id?: string | null
          pcc_task_id?: string | null
          room_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pcc_patient_id?: string | null
          pcc_task_id?: string | null
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pcc_task_links_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          employee_id: string | null
          facility_id: string | null
          floor_id: string | null
          full_name: string
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          employee_id?: string | null
          facility_id?: string | null
          floor_id?: string | null
          full_name?: string
          id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          employee_id?: string | null
          facility_id?: string | null
          floor_id?: string | null
          full_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      room_nfc_tags: {
        Row: {
          created_at: string
          id: string
          label: string | null
          room_id: string
          tag_uid: string
          tag_uid_normalized: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          room_id: string
          tag_uid: string
          tag_uid_normalized?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          room_id?: string
          tag_uid?: string
          tag_uid_normalized?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_nfc_tags_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          floor_id: string
          id: string
          qr_token: string
          room_number: string
        }
        Insert: {
          created_at?: string
          floor_id: string
          id?: string
          qr_token?: string
          room_number: string
        }
        Update: {
          created_at?: string
          floor_id?: string
          id?: string
          qr_token?: string
          room_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      round_schedules: {
        Row: {
          active: boolean
          created_at: string
          floor_id: string
          frequency: string
          grace: string
          id: string
          rounds_per_shift: number
          shift_name: string
          shift_start_time: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          floor_id: string
          frequency?: string
          grace?: string
          id?: string
          rounds_per_shift: number
          shift_name: string
          shift_start_time: string
        }
        Update: {
          active?: boolean
          created_at?: string
          floor_id?: string
          frequency?: string
          grace?: string
          id?: string
          rounds_per_shift?: number
          shift_name?: string
          shift_start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_schedules_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_error_logs: {
        Row: {
          code: string
          created_at: string
          dry_run: boolean
          id: string
          message: string | null
          qr_token: string | null
          room_id: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          dry_run?: boolean
          id?: string
          message?: string | null
          qr_token?: string | null
          room_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          dry_run?: boolean
          id?: string
          message?: string | null
          qr_token?: string | null
          room_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_error_logs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_logs: {
        Row: {
          completed_at: string
          device_label: string | null
          floor_id: string
          id: string
          input_method: string
          late_minutes: number
          room_id: string
          round_index: number
          schedule_id: string
          scheduled_for: string
          shift_label: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          device_label?: string | null
          floor_id: string
          id?: string
          input_method?: string
          late_minutes?: number
          room_id: string
          round_index: number
          schedule_id: string
          scheduled_for: string
          shift_label: string
          user_id: string
        }
        Update: {
          completed_at?: string
          device_label?: string | null
          floor_id?: string
          id?: string
          input_method?: string
          late_minutes?: number
          room_id?: string
          round_index?: number
          schedule_id?: string
          scheduled_for?: string
          shift_label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_logs_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_logs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "round_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_admin_if_none: { Args: { _user_id: string }; Returns: boolean }
      get_floor_status: {
        Args: { p_floor_id: string }
        Returns: {
          completed_at: string
          completed_by: string
          room_id: string
          room_number: string
          round_index: number
          scheduled_for: string
          status: string
        }[]
      }
      get_round_report: {
        Args: { p_floor_id: string; p_from: string; p_to: string }
        Returns: {
          completed_at: string
          employee_id: string
          employee_name: string
          late_minutes: number
          room_id: string
          room_number: string
          round_index: number
          scheduled_for: string
          shift_label: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_tag_uid: { Args: { p_uid: string }; Returns: string }
      submit_round_scan:
        | { Args: { p_qr_token: string }; Returns: Json }
        | { Args: { p_dry_run?: boolean; p_qr_token: string }; Returns: Json }
        | {
            Args: {
              p_dry_run?: boolean
              p_input_method?: string
              p_qr_token: string
            }
            Returns: Json
          }
    }
    Enums: {
      app_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
