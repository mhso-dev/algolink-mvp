export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_instructor_recommendations: {
        Row: {
          adopted_instructor_id: string | null
          created_at: string
          id: string
          model: string
          project_id: string
          top3_jsonb: Json
        }
        Insert: {
          adopted_instructor_id?: string | null
          created_at?: string
          id?: string
          model: string
          project_id: string
          top3_jsonb: Json
        }
        Update: {
          adopted_instructor_id?: string | null
          created_at?: string
          id?: string
          model?: string
          project_id?: string
          top3_jsonb?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_instructor_recommendations_adopted_instructor_id_instructors"
            columns: ["adopted_instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_instructor_recommendations_adopted_instructor_id_instructors"
            columns: ["adopted_instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_instructor_recommendations_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_resume_parses: {
        Row: {
          created_at: string
          id: string
          input_file_hash: string
          instructor_id: string | null
          model: string
          parsed_json: Json
          tokens_used: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          input_file_hash: string
          instructor_id?: string | null
          model: string
          parsed_json: Json
          tokens_used?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          input_file_hash?: string
          instructor_id?: string | null
          model?: string
          parsed_json?: Json
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_resume_parses_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_resume_parses_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_satisfaction_summaries: {
        Row: {
          generated_at: string
          id: string
          instructor_id: string
          model: string
          summary_text: string
        }
        Insert: {
          generated_at?: string
          id?: string
          instructor_id: string
          model: string
          summary_text: string
        }
        Update: {
          generated_at?: string
          id?: string
          instructor_id?: string
          model?: string
          summary_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_satisfaction_summaries_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_satisfaction_summaries_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_events: {
        Row: {
          created_at: string
          email: string | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      certifications: {
        Row: {
          created_at: string
          description: string | null
          expires_date: string | null
          id: string
          instructor_id: string
          issued_date: string | null
          issuer: string | null
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          expires_date?: string | null
          id?: string
          instructor_id: string
          issued_date?: string | null
          issuer?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          expires_date?: string | null
          id?: string
          instructor_id?: string
          issued_date?: string | null
          issuer?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "certifications_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          position: string | null
          sort_order: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          position?: string | null
          sort_order?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          position?: string | null
          sort_order?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_clients_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          business_license_file_id: string | null
          company_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          handover_memo: string | null
          id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_license_file_id?: string | null
          company_name: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          handover_memo?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_license_file_id?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          handover_memo?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_license_file_id_files_id_fk"
            columns: ["business_license_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          id: string
          note_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          note_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_note_id_notes_id_fk"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      educations: {
        Row: {
          created_at: string
          degree: string | null
          description: string | null
          end_date: string | null
          id: string
          instructor_id: string
          major: string | null
          school: string
          sort_order: number
          start_date: string | null
        }
        Insert: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id: string
          major?: string | null
          school: string
          sort_order?: number
          start_date?: string | null
        }
        Update: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id?: string
          major?: string | null
          school?: string
          sort_order?: number
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "educations_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "educations_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          id: string
          mime_type: string
          owner_id: string | null
          size_bytes: number
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          mime_type: string
          owner_id?: string | null
          size_bytes: number
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          mime_type?: string
          owner_id?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      instructor_projects: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          instructor_id: string
          role: string | null
          sort_order: number
          start_date: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id: string
          role?: string | null
          sort_order?: number
          start_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id?: string
          role?: string | null
          sort_order?: number
          start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_projects_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_projects_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_skills: {
        Row: {
          created_at: string
          instructor_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          instructor_id: string
          skill_id: string
        }
        Update: {
          created_at?: string
          instructor_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_skills_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_skills_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_skills_skill_id_skill_categories_id_fk"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          address: string | null
          bank_account_enc: string | null
          birth_date: string | null
          business_number_enc: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name_en: string | null
          name_hanja: string | null
          name_kr: string
          phone: string | null
          photo_file_id: string | null
          photo_storage_path: string | null
          resident_number_enc: string | null
          updated_at: string
          user_id: string | null
          withholding_tax_rate_enc: string | null
        }
        Insert: {
          address?: string | null
          bank_account_enc?: string | null
          birth_date?: string | null
          business_number_enc?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name_en?: string | null
          name_hanja?: string | null
          name_kr: string
          phone?: string | null
          photo_file_id?: string | null
          photo_storage_path?: string | null
          resident_number_enc?: string | null
          updated_at?: string
          user_id?: string | null
          withholding_tax_rate_enc?: string | null
        }
        Update: {
          address?: string | null
          bank_account_enc?: string | null
          birth_date?: string | null
          business_number_enc?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name_en?: string | null
          name_hanja?: string | null
          name_kr?: string
          phone?: string | null
          photo_file_id?: string | null
          photo_storage_path?: string | null
          resident_number_enc?: string | null
          updated_at?: string
          user_id?: string | null
          withholding_tax_rate_enc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructors_photo_file_id_files_id_fk"
            columns: ["photo_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          audience: Database["public"]["Enums"]["audience"]
          body_markdown: string
          created_at: string
          created_by: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience"]
          body_markdown: string
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience"]
          body_markdown?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notes_attachments: {
        Row: {
          created_at: string
          file_id: string
          note_id: string
          sort_order: string | null
        }
        Insert: {
          created_at?: string
          file_id: string
          note_id: string
          sort_order?: string | null
        }
        Update: {
          created_at?: string
          file_id?: string
          note_id?: string
          sort_order?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_attachments_file_id_files_id_fk"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_attachments_note_id_notes_id_fk"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link_url: string | null
          read_at: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          read_at?: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: []
      }
      other_activities: {
        Row: {
          activity_date: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          instructor_id: string
          sort_order: number
          title: string
        }
        Insert: {
          activity_date?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instructor_id: string
          sort_order?: number
          title: string
        }
        Update: {
          activity_date?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instructor_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_activities_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_activities_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_access_log: {
        Row: {
          accessed_at: string
          caller_id: string | null
          id: string
          target_instructor_id: string | null
        }
        Insert: {
          accessed_at?: string
          caller_id?: string | null
          id?: string
          target_instructor_id?: string | null
        }
        Update: {
          accessed_at?: string
          caller_id?: string | null
          id?: string
          target_instructor_id?: string | null
        }
        Relationships: []
      }
      project_required_skills: {
        Row: {
          created_at: string
          project_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          skill_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_required_skills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_required_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["project_status"] | null
          id: string
          project_id: string
          to_status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          project_id: string
          to_status: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          project_id?: string
          to_status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          business_amount_krw: number
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          education_end_at: string | null
          education_start_at: string | null
          id: string
          instructor_fee_krw: number
          instructor_id: string | null
          margin_krw: number | null
          notes: string | null
          operator_id: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          scheduled_at: string | null
          settlement_flow_hint: string | null
          status: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at: string
        }
        Insert: {
          business_amount_krw?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          education_end_at?: string | null
          education_start_at?: string | null
          id?: string
          instructor_fee_krw?: number
          instructor_id?: string | null
          margin_krw?: number | null
          notes?: string | null
          operator_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          scheduled_at?: string | null
          settlement_flow_hint?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          updated_at?: string
        }
        Update: {
          business_amount_krw?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          education_end_at?: string | null
          education_start_at?: string | null
          id?: string
          instructor_fee_krw?: number
          instructor_id?: string | null
          margin_krw?: number | null
          notes?: string | null
          operator_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          scheduled_at?: string | null
          settlement_flow_hint?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_clients_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          created_at: string
          description: string | null
          id: string
          instructor_id: string
          isbn: string | null
          published_date: string | null
          publisher: string | null
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          instructor_id: string
          isbn?: string | null
          published_date?: string | null
          publisher?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          instructor_id?: string
          isbn?: string | null
          published_date?: string | null
          publisher?: string | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      satisfaction_reviews: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          instructor_id: string
          project_id: string
          score: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          instructor_id: string
          project_id: string
          score: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          instructor_id?: string
          project_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "satisfaction_reviews_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_reviews_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_reviews_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_items: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          instructor_id: string
          notes: string | null
          project_id: string | null
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          starts_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          instructor_id: string
          notes?: string | null
          project_id?: string | null
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          starts_at: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          instructor_id?: string
          notes?: string | null
          project_id?: string | null
          schedule_kind?: Database["public"]["Enums"]["schedule_kind"]
          starts_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["settlement_status"] | null
          id: string
          settlement_id: string
          to_status: Database["public"]["Enums"]["settlement_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["settlement_status"] | null
          id?: string
          settlement_id: string
          to_status: Database["public"]["Enums"]["settlement_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["settlement_status"] | null
          id?: string
          settlement_id?: string
          to_status?: Database["public"]["Enums"]["settlement_status"]
        }
        Relationships: [
          {
            foreignKeyName: "settlement_status_history_settlement_id_settlements_id_fk"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          business_amount_krw: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          instructor_fee_krw: number
          instructor_id: string
          notes: string | null
          payment_received_at: string | null
          payout_sent_at: string | null
          profit_krw: number | null
          project_id: string
          settlement_flow: Database["public"]["Enums"]["settlement_flow"]
          status: Database["public"]["Enums"]["settlement_status"]
          tax_invoice_issued: boolean
          tax_invoice_issued_at: string | null
          updated_at: string
          withholding_tax_amount_krw: number | null
          withholding_tax_rate: number
        }
        Insert: {
          business_amount_krw: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          instructor_fee_krw: number
          instructor_id: string
          notes?: string | null
          payment_received_at?: string | null
          payout_sent_at?: string | null
          profit_krw?: number | null
          project_id: string
          settlement_flow: Database["public"]["Enums"]["settlement_flow"]
          status?: Database["public"]["Enums"]["settlement_status"]
          tax_invoice_issued?: boolean
          tax_invoice_issued_at?: string | null
          updated_at?: string
          withholding_tax_amount_krw?: number | null
          withholding_tax_rate?: number
        }
        Update: {
          business_amount_krw?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          instructor_fee_krw?: number
          instructor_id?: string
          notes?: string | null
          payment_received_at?: string | null
          payout_sent_at?: string | null
          profit_krw?: number | null
          project_id?: string
          settlement_flow?: Database["public"]["Enums"]["settlement_flow"]
          status?: Database["public"]["Enums"]["settlement_status"]
          tax_invoice_issued?: boolean
          tax_invoice_issued_at?: string | null
          updated_at?: string
          withholding_tax_amount_krw?: number | null
          withholding_tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlements_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_project_id_projects_id_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      teaching_experiences: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          instructor_id: string
          organization: string | null
          sort_order: number
          start_date: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id: string
          organization?: string | null
          sort_order?: number
          start_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id?: string
          organization?: string | null
          sort_order?: number
          start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_experiences_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_experiences_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_role: Database["public"]["Enums"]["user_role"]
          revoked_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_role: Database["public"]["Enums"]["user_role"]
          revoked_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_role?: Database["public"]["Enums"]["user_role"]
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name_kr: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name_kr: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name_kr?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      work_experiences: {
        Row: {
          company: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          instructor_id: string
          position: string | null
          sort_order: number
          start_date: string | null
        }
        Insert: {
          company: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id: string
          position?: string | null
          sort_order?: number
          start_date?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id?: string
          position?: string | null
          sort_order?: number
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_experiences_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_experiences_instructor_id_instructors_id_fk"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      instructors_safe: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string | null
          name_en: string | null
          name_hanja: string | null
          name_kr: string | null
          phone: string | null
          photo_file_id: string | null
          photo_storage_path: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          name_en?: string | null
          name_hanja?: string | null
          name_kr?: string | null
          phone?: string | null
          photo_file_id?: string | null
          photo_storage_path?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string | null
          name_en?: string | null
          name_hanja?: string | null
          name_kr?: string | null
          phone?: string | null
          photo_file_id?: string | null
          photo_storage_path?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructors_photo_file_id_files_id_fk"
            columns: ["photo_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      debug_current_role: { Args: never; Returns: Json }
    }
    Enums: {
      audience: "instructor" | "internal"
      entity_type: "project" | "instructor" | "client"
      notification_type:
        | "assignment_overdue"
        | "schedule_conflict"
        | "low_satisfaction_assignment"
        | "dday_unprocessed"
        | "settlement_requested"
        | "assignment_request"
      project_status:
        | "proposal"
        | "contract_confirmed"
        | "lecture_requested"
        | "instructor_sourcing"
        | "assignment_review"
        | "assignment_confirmed"
        | "education_confirmed"
        | "recruiting"
        | "progress_confirmed"
        | "in_progress"
        | "education_done"
        | "settlement_in_progress"
        | "task_done"
      project_type: "education" | "material_development"
      schedule_kind: "system_lecture" | "personal" | "unavailable"
      settlement_flow: "corporate" | "government"
      settlement_status: "pending" | "requested" | "paid" | "held"
      user_role: "instructor" | "operator" | "admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      audience: ["instructor", "internal"],
      entity_type: ["project", "instructor", "client"],
      notification_type: [
        "assignment_overdue",
        "schedule_conflict",
        "low_satisfaction_assignment",
        "dday_unprocessed",
        "settlement_requested",
        "assignment_request",
      ],
      project_status: [
        "proposal",
        "contract_confirmed",
        "lecture_requested",
        "instructor_sourcing",
        "assignment_review",
        "assignment_confirmed",
        "education_confirmed",
        "recruiting",
        "progress_confirmed",
        "in_progress",
        "education_done",
        "settlement_in_progress",
        "task_done",
      ],
      project_type: ["education", "material_development"],
      schedule_kind: ["system_lecture", "personal", "unavailable"],
      settlement_flow: ["corporate", "government"],
      settlement_status: ["pending", "requested", "paid", "held"],
      user_role: ["instructor", "operator", "admin"],
    },
  },
} as const

