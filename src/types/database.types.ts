// Generated from the live Supabase project by scripts/generate-types.ts.
// Do not edit by hand — re-run `npm run supabase:types` instead.
//
// Mirrors supabase/migrations/*.sql. The Supabase CLI equivalent needs a
// personal access token: npx supabase gen types typescript --project-id ipamzezkhxrnynskavsz

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      attendance: {
        Row: { id: string; event_id: string; participant_id: string; checked_in_at: string }
        Insert: { id?: string; event_id: string; participant_id: string; checked_in_at?: string }
        Update: { id?: string; event_id?: string; participant_id?: string; checked_in_at?: string }
        Relationships: [
        {
          foreignKeyName: "attendance_event_id_fkey";
          columns: ["event_id"];
          isOneToOne: false;
          referencedRelation: "events";
          referencedColumns: ["id"];
        },
        {
          foreignKeyName: "attendance_participant_event_fkey";
          columns: ["event_id", "participant_id"];
          isOneToOne: false;
          referencedRelation: "participants";
          referencedColumns: ["event_id", "id"];
        }
      ]
      },
      certificates: {
        Row: { id: string; event_id: string; participant_id: string; template_id: string | null; certificate_type: string; award: string; signatory: string; issued_at: string; verification_token: string }
        Insert: { id?: string; event_id: string; participant_id: string; template_id?: string | null; certificate_type?: string; award?: string; signatory?: string; issued_at?: string; verification_token?: string }
        Update: { id?: string; event_id?: string; participant_id?: string; template_id?: string | null; certificate_type?: string; award?: string; signatory?: string; issued_at?: string; verification_token?: string }
        Relationships: [
        {
          foreignKeyName: "certificates_event_id_fkey";
          columns: ["event_id"];
          isOneToOne: false;
          referencedRelation: "events";
          referencedColumns: ["id"];
        },
        {
          foreignKeyName: "certificates_participant_event_fkey";
          columns: ["event_id", "participant_id"];
          isOneToOne: false;
          referencedRelation: "participants";
          referencedColumns: ["event_id", "id"];
        },
        {
          foreignKeyName: "certificates_template_id_fkey";
          columns: ["template_id"];
          isOneToOne: false;
          referencedRelation: "templates";
          referencedColumns: ["id"];
        }
      ]
      },
      event_design_templates: {
        Row: { id: string; event_id: string; name: string; kind: string; storage_path: string; image_width: number; image_height: number; design_config: Json; created_at: string; created_by: string | null; updated_at: string }
        Insert: { id?: string; event_id: string; name: string; kind: string; storage_path: string; image_width: number; image_height: number; design_config?: Json; created_at?: string; created_by?: string | null; updated_at?: string }
        Update: { id?: string; event_id?: string; name?: string; kind?: string; storage_path?: string; image_width?: number; image_height?: number; design_config?: Json; created_at?: string; created_by?: string | null; updated_at?: string }
        Relationships: [
        {
          foreignKeyName: "event_design_templates_created_by_fkey";
          columns: ["created_by"];
          isOneToOne: false;
          referencedRelation: "auth.users";
          referencedColumns: ["id"];
        },
        {
          foreignKeyName: "event_design_templates_event_id_fkey";
          columns: ["event_id"];
          isOneToOne: false;
          referencedRelation: "events";
          referencedColumns: ["id"];
        }
      ]
      },
      events: {
        Row: { id: string; organizer_id: string; name: string; description: string; date: string; start_time: string; end_time: string; venue: string; organizer_name: string; logo_url: string | null; cover_image_url: string | null; map_url: string | null; theme: string; registration_open: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; organizer_id: string; name: string; description?: string; date: string; start_time: string; end_time: string; venue: string; organizer_name: string; logo_url?: string | null; cover_image_url?: string | null; map_url?: string | null; theme?: string; registration_open?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; organizer_id?: string; name?: string; description?: string; date?: string; start_time?: string; end_time?: string; venue?: string; organizer_name?: string; logo_url?: string | null; cover_image_url?: string | null; map_url?: string | null; theme?: string; registration_open?: boolean; created_at?: string; updated_at?: string }
        Relationships: [
        {
          foreignKeyName: "events_organizer_id_fkey";
          columns: ["organizer_id"];
          isOneToOne: false;
          referencedRelation: "auth.users";
          referencedColumns: ["id"];
        }
      ]
      },
      participants: {
        Row: { id: string; event_id: string; name: string; student_id: string | null; email: string | null; course: string | null; year_section: string | null; role: string; qr_token: string; created_at: string; organization: string | null; title: string | null }
        Insert: { id?: string; event_id: string; name: string; student_id?: string | null; email?: string | null; course?: string | null; year_section?: string | null; role?: string; qr_token?: string; created_at?: string; organization?: string | null; title?: string | null }
        Update: { id?: string; event_id?: string; name?: string; student_id?: string | null; email?: string | null; course?: string | null; year_section?: string | null; role?: string; qr_token?: string; created_at?: string; organization?: string | null; title?: string | null }
        Relationships: [
        {
          foreignKeyName: "participants_event_id_fkey";
          columns: ["event_id"];
          isOneToOne: false;
          referencedRelation: "events";
          referencedColumns: ["id"];
        }
      ]
      },
      profiles: {
        Row: { id: string; email: string; full_name: string | null; created_at: string }
        Insert: { id: string; email?: string; full_name?: string | null; created_at?: string }
        Update: { id?: string; email?: string; full_name?: string | null; created_at?: string }
        Relationships: [
        {
          foreignKeyName: "profiles_id_fkey";
          columns: ["id"];
          isOneToOne: true;
          referencedRelation: "auth.users";
          referencedColumns: ["id"];
        }
      ]
      },
      rules: {
        Row: { id: string; event_id: string; title: string; content: string; sort_order: number; created_at: string }
        Insert: { id?: string; event_id: string; title: string; content: string; sort_order?: number; created_at?: string }
        Update: { id?: string; event_id?: string; title?: string; content?: string; sort_order?: number; created_at?: string }
        Relationships: [
        {
          foreignKeyName: "rules_event_id_fkey";
          columns: ["event_id"];
          isOneToOne: false;
          referencedRelation: "events";
          referencedColumns: ["id"];
        }
      ]
      },
      schedules: {
        Row: { id: string; event_id: string; title: string; description: string; start_time: string; end_time: string; location: string; sort_order: number; created_at: string }
        Insert: { id?: string; event_id: string; title: string; description?: string; start_time: string; end_time: string; location?: string; sort_order?: number; created_at?: string }
        Update: { id?: string; event_id?: string; title?: string; description?: string; start_time?: string; end_time?: string; location?: string; sort_order?: number; created_at?: string }
        Relationships: [
        {
          foreignKeyName: "schedules_event_id_fkey";
          columns: ["event_id"];
          isOneToOne: false;
          referencedRelation: "events";
          referencedColumns: ["id"];
        }
      ]
      },
      templates: {
        Row: { id: string; type: string; name: string; preview_url: string | null; template_config: Json; created_at: string }
        Insert: { id?: string; type: string; name: string; preview_url?: string | null; template_config?: Json; created_at?: string }
        Update: { id?: string; type?: string; name?: string; preview_url?: string | null; template_config?: Json; created_at?: string }
        Relationships: []
      },
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_certificate_verification: {
        Args: { p_token: string }
        Returns: { certificate_type: string; award: string; issued_at: string; recipient_name: string; recipient_role: string; recipient_title: string; recipient_organization: string; event_id: string; event_name: string; event_venue: string; event_date: string }[]
      },
      get_participant_pass: {
        Args: { p_event_id: string; p_token: string }
        Returns: { id: string; event_id: string; name: string; student_id: string; course: string; year_section: string; role: string; organization: string; title: string; qr_token: string; checked_in_at: string; certificate_type: string; certificate_award: string }[]
      },
      register_participant: {
        Args: { p_event_id: string; p_name: string; p_student_id: string; p_course: string; p_year_section: string; p_email: string }
        Returns: { id: string; qr_token: string }[]
      },
      set_updated_at: {
        Args: Record<PropertyKey, never>
        Returns: unknown[]
      },
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<
  PublicTableName extends keyof (PublicSchema['Tables'] & PublicSchema['Views']),
> =
  (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableName] extends { Row: infer Row }
    ? Row
    : never

export type TablesInsert<PublicTableName extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][PublicTableName]['Insert']

export type TablesUpdate<PublicTableName extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][PublicTableName]['Update']

export type Enums<PublicEnumName extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][PublicEnumName]

export type CompositeTypes<PublicCompositeTypeName extends keyof PublicSchema['CompositeTypes']> =
  PublicSchema['CompositeTypes'][PublicCompositeTypeName]
