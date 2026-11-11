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
      admin_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          sub_role: Database["public"]["Enums"]["admin_sub_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          sub_role: Database["public"]["Enums"]["admin_sub_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          sub_role?: Database["public"]["Enums"]["admin_sub_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          ip: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          ip?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          ip?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_schedules: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string
          rate_bps: number
          starts_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          rate_bps: number
          starts_at: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          rate_bps?: number
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_schedules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      price_tiers: {
        Row: {
          min_qty: number
          product_id: string
          unit_price_centavos: number
        }
        Insert: {
          min_qty: number
          product_id: string
          unit_price_centavos: number
        }
        Update: {
          min_qty?: number
          product_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          created_at: string
          id: string
          product_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["product_status"] | null
          id: number
          product_id: string
          reason: string
          to_status: Database["public"]["Enums"]["product_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["product_status"] | null
          id?: never
          product_id: string
          reason?: string
          to_status: Database["public"]["Enums"]["product_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["product_status"] | null
          id?: never
          product_id?: string
          reason?: string
          to_status?: Database["public"]["Enums"]["product_status"]
        }
        Relationships: [
          {
            foreignKeyName: "product_status_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          created_at: string
          description: string
          id: string
          idempotency_key: string
          indicative_price_centavos: number | null
          lead_days: number | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          moq: number
          return_class: Database["public"]["Enums"]["return_class"]
          review_note: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["product_status"]
          submitted_at: string | null
          supplier_id: string
          title: string
          unit: Database["public"]["Enums"]["product_unit"]
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description: string
          id?: string
          idempotency_key: string
          indicative_price_centavos?: number | null
          lead_days?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          moq: number
          return_class: Database["public"]["Enums"]["return_class"]
          review_note?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          submitted_at?: string | null
          supplier_id: string
          title: string
          unit: Database["public"]["Enums"]["product_unit"]
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          idempotency_key?: string
          indicative_price_centavos?: number | null
          lead_days?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          moq?: number
          return_class?: Database["public"]["Enums"]["return_class"]
          review_note?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          submitted_at?: string | null
          supplier_id?: string
          title?: string
          unit?: Database["public"]["Enums"]["product_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          about: string
          business_name: string
          city: string
          created_at: string
          email: string
          full_name: string
          id: string
          industry: string
          phone: string
          province: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          website: string
        }
        Insert: {
          about?: string
          business_name?: string
          city?: string
          created_at?: string
          email?: string
          full_name?: string
          id: string
          industry?: string
          phone?: string
          province?: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          website?: string
        }
        Update: {
          about?: string
          business_name?: string
          city?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          industry?: string
          phone?: string
          province?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      saved_items: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["saved_kind"]
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["saved_kind"]
          target_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["saved_kind"]
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_synonyms: {
        Row: {
          synonym: string
          term: string
        }
        Insert: {
          synonym: string
          term: string
        }
        Update: {
          synonym?: string
          term?: string
        }
        Relationships: []
      }
      supplier_documents: {
        Row: {
          created_at: string
          file_name: string
          id: string
          kind: Database["public"]["Enums"]["supplier_document_kind"]
          storage_path: string
          supplier_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          kind: Database["public"]["Enums"]["supplier_document_kind"]
          storage_path: string
          supplier_id: string
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["supplier_document_kind"]
          storage_path?: string
          supplier_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["supplier_status"] | null
          id: number
          reason: string
          supplier_id: string
          to_status: Database["public"]["Enums"]["supplier_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["supplier_status"] | null
          id?: never
          reason?: string
          supplier_id: string
          to_status: Database["public"]["Enums"]["supplier_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["supplier_status"] | null
          id?: never
          reason?: string
          supplier_id?: string
          to_status?: Database["public"]["Enums"]["supplier_status"]
        }
        Relationships: [
          {
            foreignKeyName: "supplier_status_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          business_name: string
          business_type: Database["public"]["Enums"]["business_type"]
          category_id: string
          city: string
          created_at: string
          delivery_areas: string[]
          description: string
          id: string
          keywords: string
          lead_days: number
          legal_name: string
          max_quantity: number | null
          moq: number
          owner_id: string
          province: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["supplier_status"]
          submitted_at: string
          updated_at: string
          years_operating: number | null
        }
        Insert: {
          business_name: string
          business_type?: Database["public"]["Enums"]["business_type"]
          category_id: string
          city: string
          created_at?: string
          delivery_areas?: string[]
          description: string
          id?: string
          keywords?: string
          lead_days: number
          legal_name: string
          max_quantity?: number | null
          moq: number
          owner_id: string
          province: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          submitted_at?: string
          updated_at?: string
          years_operating?: number | null
        }
        Update: {
          business_name?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          category_id?: string
          city?: string
          created_at?: string
          delivery_areas?: string[]
          description?: string
          id?: string
          keywords?: string
          lead_days?: number
          legal_name?: string
          max_quantity?: number | null
          moq?: number
          owner_id?: string
          province?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          submitted_at?: string
          updated_at?: string
          years_operating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_commission_schedule: {
        Args: {
          p_category_id?: string
          p_note?: string
          p_rate_bps: number
          p_starts_at: string
        }
        Returns: string
      }
      admin_add_search_synonym: {
        Args: { p_synonym: string; p_term: string }
        Returns: undefined
      }
      admin_grant_role: {
        Args: {
          p_sub_role: Database["public"]["Enums"]["admin_sub_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_remove_search_synonym: {
        Args: { p_synonym: string; p_term: string }
        Returns: undefined
      }
      admin_review_product: {
        Args: {
          p_product_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["product_status"]
        }
        Returns: undefined
      }
      admin_revoke_role: {
        Args: {
          p_sub_role: Database["public"]["Enums"]["admin_sub_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_set_account_status: {
        Args: {
          p_reason: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_set_supplier_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["supplier_status"]
          p_supplier_id: string
        }
        Returns: undefined
      }
      admin_update_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      commission_rate_bps: {
        Args: { p_at?: string; p_category_id: string }
        Returns: number
      }
      create_product: {
        Args: {
          p_category_slug: string
          p_description: string
          p_idempotency_key: string
          p_indicative_price_centavos: number
          p_lead_days: number
          p_listing_type: Database["public"]["Enums"]["listing_type"]
          p_moq: number
          p_price_tiers?: Json
          p_return_class: Database["public"]["Enums"]["return_class"]
          p_title: string
          p_unit: Database["public"]["Enums"]["product_unit"]
        }
        Returns: string
      }
      has_admin_role: {
        Args: { roles: Database["public"]["Enums"]["admin_sub_role"][] }
        Returns: boolean
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      search_catalog: {
        Args: {
          p_business_type?: Database["public"]["Enums"]["business_type"]
          p_category_slug?: string
          p_listing_type?: Database["public"]["Enums"]["listing_type"]
          p_max_moq?: number
          p_max_price_centavos?: number
          p_min_price_centavos?: number
          p_page?: number
          p_page_size?: number
          p_province?: string
          p_query?: string
          p_sort?: string
        }
        Returns: {
          product_id: string
          score: number
          total_count: number
        }[]
      }
      submit_product: { Args: { p_product_id: string }; Returns: undefined }
      submit_supplier_application: {
        Args: {
          p_business_name: string
          p_category_slug: string
          p_city: string
          p_description: string
          p_lead_days: number
          p_legal_name: string
          p_moq: number
          p_province: string
        }
        Returns: string
      }
      update_product: {
        Args: {
          p_category_slug: string
          p_description: string
          p_indicative_price_centavos: number
          p_lead_days: number
          p_listing_type: Database["public"]["Enums"]["listing_type"]
          p_moq: number
          p_price_tiers?: Json
          p_product_id: string
          p_return_class: Database["public"]["Enums"]["return_class"]
          p_title: string
          p_unit: Database["public"]["Enums"]["product_unit"]
        }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      admin_sub_role: "verifier" | "support" | "finance" | "super_admin"
      business_type:
        | "manufacturer"
        | "supplier"
        | "wholesaler"
        | "distributor"
        | "service_provider"
      listing_type: "product" | "service"
      product_status: "draft" | "pending" | "approved" | "rejected"
      product_unit: "pcs" | "boxes" | "packs" | "sets" | "kg"
      return_class: "standard" | "custom" | "final_sale"
      saved_kind: "product" | "supplier"
      supplier_document_kind:
        | "dti_sec"
        | "bir"
        | "mayors_permit"
        | "valid_id"
        | "other"
      supplier_status:
        | "pending"
        | "under_review"
        | "verified"
        | "rejected"
        | "suspended"
        | "restricted"
      user_role: "buyer" | "supplier" | "admin"
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
      account_status: ["active", "suspended"],
      admin_sub_role: ["verifier", "support", "finance", "super_admin"],
      business_type: [
        "manufacturer",
        "supplier",
        "wholesaler",
        "distributor",
        "service_provider",
      ],
      listing_type: ["product", "service"],
      product_status: ["draft", "pending", "approved", "rejected"],
      product_unit: ["pcs", "boxes", "packs", "sets", "kg"],
      return_class: ["standard", "custom", "final_sale"],
      saved_kind: ["product", "supplier"],
      supplier_document_kind: [
        "dti_sec",
        "bir",
        "mayors_permit",
        "valid_id",
        "other",
      ],
      supplier_status: [
        "pending",
        "under_review",
        "verified",
        "rejected",
        "suspended",
        "restricted",
      ],
      user_role: ["buyer", "supplier", "admin"],
    },
  },
} as const

