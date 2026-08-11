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
      answers: {
        Row: {
          attempt_id: string
          created_at: string
          criteria_scores: Json | null
          id: string
          is_correct: boolean
          question_id: string
          selected_index: number | null
          text_answer: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          criteria_scores?: Json | null
          id?: string
          is_correct?: boolean
          question_id: string
          selected_index?: number | null
          text_answer?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          criteria_scores?: Json | null
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_index?: number | null
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          created_at: string
          duration_seconds: number | null
          finished_at: string | null
          id: string
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          quiz_id: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          quiz_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      depots: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          content_text: string | null
          created_at: string
          id: string
          level: Database["public"]["Enums"]["agent_level"]
          storage_path: string
          subject: Database["public"]["Enums"]["subject"]
          title: string
          uploaded_by: string | null
        }
        Insert: {
          content_text?: string | null
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["agent_level"]
          storage_path: string
          subject: Database["public"]["Enums"]["subject"]
          title: string
          uploaded_by?: string | null
        }
        Update: {
          content_text?: string | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["agent_level"]
          storage_path?: string
          subject?: Database["public"]["Enums"]["subject"]
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      duty_logs: {
        Row: {
          agent_id: string
          created_at: string
          depot_id: string | null
          end_time: string | null
          equipment_ok: boolean
          handover_from: string | null
          handover_to: string | null
          id: string
          observations: string | null
          post: string
          service_date: string
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          depot_id?: string | null
          end_time?: string | null
          equipment_ok?: boolean
          handover_from?: string | null
          handover_to?: string | null
          id?: string
          observations?: string | null
          post?: string
          service_date?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          depot_id?: string | null
          end_time?: string | null
          equipment_ok?: boolean
          handover_from?: string | null
          handover_to?: string | null
          id?: string
          observations?: string | null
          post?: string
          service_date?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_logs_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_actions: {
        Row: {
          action: string
          actor_id: string
          comment: string | null
          created_at: string
          forwarded_to: string | null
          id: string
          report_id: string
        }
        Insert: {
          action: string
          actor_id: string
          comment?: string | null
          created_at?: string
          forwarded_to?: string | null
          id?: string
          report_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          comment?: string | null
          created_at?: string
          forwarded_to?: string | null
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "incident_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          author_id: string
          closed_at: string | null
          created_at: string
          current_holder_id: string | null
          description: string
          id: string
          location: string
          measures: string | null
          occurred_at: string
          severity: string
          status: string
          title: string
          train_number: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          closed_at?: string | null
          created_at?: string
          current_holder_id?: string | null
          description?: string
          id?: string
          location?: string
          measures?: string | null
          occurred_at?: string
          severity?: string
          status?: string
          title: string
          train_number?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          closed_at?: string | null
          created_at?: string
          current_holder_id?: string | null
          description?: string
          id?: string
          location?: string
          measures?: string | null
          occurred_at?: string
          severity?: string
          status?: string
          title?: string
          train_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      movement_lines: {
        Row: {
          allowance_code: string | null
          arrival: string | null
          created_at: string
          departure: string | null
          distance_km: number
          end_time: string | null
          hours: number
          id: string
          notes: string | null
          record_id: string
          service_type: string
          start_time: string | null
          train_number: string | null
          work_date: string
        }
        Insert: {
          allowance_code?: string | null
          arrival?: string | null
          created_at?: string
          departure?: string | null
          distance_km?: number
          end_time?: string | null
          hours?: number
          id?: string
          notes?: string | null
          record_id: string
          service_type?: string
          start_time?: string | null
          train_number?: string | null
          work_date: string
        }
        Update: {
          allowance_code?: string | null
          arrival?: string | null
          created_at?: string
          departure?: string | null
          distance_km?: number
          end_time?: string | null
          hours?: number
          id?: string
          notes?: string | null
          record_id?: string
          service_type?: string
          start_time?: string | null
          train_number?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_lines_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "movement_records"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_records: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          payroll_exported_at: string | null
          period_end: string
          period_start: string
          review_comment: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          validated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          payroll_exported_at?: string | null
          period_end: string
          period_start: string
          review_comment?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          validated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          payroll_exported_at?: string | null
          period_end?: string
          period_start?: string
          review_comment?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          depot_id: string | null
          email: string | null
          full_name: string | null
          id: string
          level: Database["public"]["Enums"]["agent_level"] | null
          manager_id: string | null
          matricule: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          depot_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          level?: Database["public"]["Enums"]["agent_level"] | null
          manager_id?: string | null
          matricule?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          depot_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          level?: Database["public"]["Enums"]["agent_level"] | null
          manager_id?: string | null
          matricule?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          choices: Json | null
          correct_index: number | null
          created_at: string
          criteria: Json
          explanation: string | null
          id: string
          model_answer: string | null
          points: number
          position: number
          prompt: string
          quiz_id: string
          type: string
        }
        Insert: {
          choices?: Json | null
          correct_index?: number | null
          created_at?: string
          criteria?: Json
          explanation?: string | null
          id?: string
          model_answer?: string | null
          points?: number
          position?: number
          prompt: string
          quiz_id: string
          type?: string
        }
        Update: {
          choices?: Json | null
          correct_index?: number | null
          created_at?: string
          criteria?: Json
          explanation?: string | null
          id?: string
          model_answer?: string | null
          points?: number
          position?: number
          prompt?: string
          quiz_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_versions: {
        Row: {
          id: string
          level: Database["public"]["Enums"]["agent_level"]
          published_at: string
          published_by: string | null
          questions: Json
          quiz_id: string
          subject: Database["public"]["Enums"]["subject"]
          title: string
          version: number
        }
        Insert: {
          id?: string
          level: Database["public"]["Enums"]["agent_level"]
          published_at?: string
          published_by?: string | null
          questions?: Json
          quiz_id: string
          subject: Database["public"]["Enums"]["subject"]
          title: string
          version: number
        }
        Update: {
          id?: string
          level?: Database["public"]["Enums"]["agent_level"]
          published_at?: string
          published_by?: string | null
          questions?: Json
          quiz_id?: string
          subject?: Database["public"]["Enums"]["subject"]
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_versions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          document_id: string | null
          id: string
          level: Database["public"]["Enums"]["agent_level"]
          published_at: string | null
          status: Database["public"]["Enums"]["quiz_status"]
          subject: Database["public"]["Enums"]["subject"]
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          document_id?: string | null
          id?: string
          level: Database["public"]["Enums"]["agent_level"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["quiz_status"]
          subject: Database["public"]["Enums"]["subject"]
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          document_id?: string | null
          id?: string
          level?: Database["public"]["Enums"]["agent_level"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["quiz_status"]
          subject?: Database["public"]["Enums"]["subject"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sheet_lines: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string
          end_time: string | null
          id: string
          notes: string | null
          role_label: string | null
          sheet_id: string
          start_time: string | null
          task: string | null
          train_number: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          role_label?: string | null
          sheet_id: string
          start_time?: string | null
          task?: string | null
          train_number?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          role_label?: string | null
          sheet_id?: string
          start_time?: string | null
          task?: string | null
          train_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_sheet_lines_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "service_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sheets: {
        Row: {
          created_at: string
          created_by: string
          depot_id: string | null
          id: string
          notes: string | null
          service_date: string
          shift: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          depot_id?: string | null
          id?: string
          notes?: string | null
          service_date: string
          shift?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          depot_id?: string | null
          id?: string
          notes?: string | null
          service_date?: string
          shift?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_sheets_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
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
      [_ in never]: never
    }
    Enums: {
      agent_level:
        | "aide_conducteur"
        | "conducteur_manoeuvre"
        | "conducteur_ligne"
        | "chef_traction"
        | "chef_cours"
        | "surveillant"
        | "chef_commande_conducteur"
        | "chef_depot"
        | "chef_departement"
        | "assistant_chef_departement"
      app_role: "admin" | "formateur" | "agent"
      quiz_status: "draft" | "published"
      subject: "igs" | "prac" | "frein" | "technologies"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      agent_level: [
        "aide_conducteur",
        "conducteur_manoeuvre",
        "conducteur_ligne",
        "chef_traction",
        "chef_cours",
        "surveillant",
        "chef_commande_conducteur",
        "chef_depot",
        "chef_departement",
        "assistant_chef_departement",
      ],
      app_role: ["admin", "formateur", "agent"],
      quiz_status: ["draft", "published"],
      subject: ["igs", "prac", "frein", "technologies"],
    },
  },
} as const
