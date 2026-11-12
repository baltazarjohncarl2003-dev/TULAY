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
      addresses: {
        Row: {
          barangay: string
          city: string
          created_at: string
          id: string
          label: string
          line1: string
          line2: string
          phone: string
          postal_code: string
          province: string
          recipient: string
          user_id: string
        }
        Insert: {
          barangay?: string
          city: string
          created_at?: string
          id?: string
          label?: string
          line1: string
          line2?: string
          phone: string
          postal_code?: string
          province: string
          recipient: string
          user_id?: string
        }
        Update: {
          barangay?: string
          city?: string
          created_at?: string
          id?: string
          label?: string
          line1?: string
          line2?: string
          phone?: string
          postal_code?: string
          province?: string
          recipient?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      artwork_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          note: string
          order_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          note?: string
          order_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          note?: string
          order_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "artwork_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
          user_id?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
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
      checkouts: {
        Row: {
          buyer_id: string
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_option: Database["public"]["Enums"]["payment_option"]
          selection_id: string | null
          status: Database["public"]["Enums"]["checkout_status"]
          total_centavos: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_option?: Database["public"]["Enums"]["payment_option"]
          selection_id?: string | null
          status?: Database["public"]["Enums"]["checkout_status"]
          total_centavos: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_option?: Database["public"]["Enums"]["payment_option"]
          selection_id?: string | null
          status?: Database["public"]["Enums"]["checkout_status"]
          total_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkouts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkouts_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "selections"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_evidence: {
        Row: {
          claim_id: string
          created_at: string
          file_name: string
          id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          file_name: string
          id?: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          file_name?: string
          id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_messages: {
        Row: {
          body: string
          claim_id: string
          created_at: string
          id: number
          sender_id: string
        }
        Insert: {
          body: string
          claim_id: string
          created_at?: string
          id?: never
          sender_id: string
        }
        Update: {
          body?: string
          claim_id?: string
          created_at?: string
          id?: never
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_messages_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_status_history: {
        Row: {
          actor_id: string | null
          claim_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["claim_status"] | null
          id: number
          note: string
          to_status: Database["public"]["Enums"]["claim_status"]
        }
        Insert: {
          actor_id?: string | null
          claim_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["claim_status"] | null
          id?: never
          note?: string
          to_status: Database["public"]["Enums"]["claim_status"]
        }
        Update: {
          actor_id?: string | null
          claim_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["claim_status"] | null
          id?: never
          note?: string
          to_status?: Database["public"]["Enums"]["claim_status"]
        }
        Relationships: [
          {
            foreignKeyName: "claim_status_history_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          buyer_id: string
          created_at: string
          decided_by: string | null
          decision_note: string
          description: string
          id: string
          item_ids: string[]
          manual_refund_centavos: number
          manual_refund_ref: string
          online_refund_id: string | null
          order_id: string
          ra_number: string | null
          ref: string
          refund_centavos: number
          remedy: Database["public"]["Enums"]["claim_remedy"] | null
          resolved_at: string | null
          response_note: string
          restocking_fee_centavos: number
          return_payer: string | null
          return_received_at: string | null
          return_required: boolean
          return_tracking_ref: string
          status: Database["public"]["Enums"]["claim_status"]
          supplier_id: string
          type: Database["public"]["Enums"]["claim_type"]
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          decided_by?: string | null
          decision_note?: string
          description: string
          id: string
          item_ids?: string[]
          manual_refund_centavos?: number
          manual_refund_ref?: string
          online_refund_id?: string | null
          order_id: string
          ra_number?: string | null
          ref?: string
          refund_centavos?: number
          remedy?: Database["public"]["Enums"]["claim_remedy"] | null
          resolved_at?: string | null
          response_note?: string
          restocking_fee_centavos?: number
          return_payer?: string | null
          return_received_at?: string | null
          return_required?: boolean
          return_tracking_ref?: string
          status?: Database["public"]["Enums"]["claim_status"]
          supplier_id: string
          type: Database["public"]["Enums"]["claim_type"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          decided_by?: string | null
          decision_note?: string
          description?: string
          id?: string
          item_ids?: string[]
          manual_refund_centavos?: number
          manual_refund_ref?: string
          online_refund_id?: string | null
          order_id?: string
          ra_number?: string | null
          ref?: string
          refund_centavos?: number
          remedy?: Database["public"]["Enums"]["claim_remedy"] | null
          resolved_at?: string | null
          response_note?: string
          restocking_fee_centavos?: number
          return_payer?: string | null
          return_received_at?: string | null
          return_required?: boolean
          return_tracking_ref?: string
          status?: Database["public"]["Enums"]["claim_status"]
          supplier_id?: string
          type?: Database["public"]["Enums"]["claim_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_online_refund_id_fkey"
            columns: ["online_refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_remittances: {
        Row: {
          amount_centavos: number
          id: number
          order_id: string
          reported_at: string
        }
        Insert: {
          amount_centavos: number
          id?: never
          order_id: string
          reported_at?: string
        }
        Update: {
          amount_centavos?: number
          id?: never
          order_id?: string
          reported_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cod_remittances_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
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
      ledger_entries: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"]
          created_at: string
          credit_centavos: number
          debit_centavos: number
          id: number
          memo: string
          order_id: string | null
          payment_id: string | null
          payout_id: string | null
          refund_id: string | null
          supplier_id: string | null
          txn_id: string
        }
        Insert: {
          account: Database["public"]["Enums"]["ledger_account"]
          created_at?: string
          credit_centavos?: number
          debit_centavos?: number
          id?: never
          memo?: string
          order_id?: string | null
          payment_id?: string | null
          payout_id?: string | null
          refund_id?: string | null
          supplier_id?: string | null
          txn_id: string
        }
        Update: {
          account?: Database["public"]["Enums"]["ledger_account"]
          created_at?: string
          credit_centavos?: number
          debit_centavos?: number
          id?: never
          memo?: string
          order_id?: string | null
          payment_id?: string | null
          payout_id?: string | null
          refund_id?: string | null
          supplier_id?: string | null
          txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: number
          link: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          link?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          link?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          action: Database["public"]["Enums"]["offer_action"]
          actor_id: string
          created_at: string
          id: string
          idempotency_key: string
          lead_days: number
          message: string
          payment_terms: string
          quantity: number
          quote_id: string
          related_offer_id: string | null
          rfq_id: string
          seq: number
          supplier_id: string
          unit_price_centavos: number
        }
        Insert: {
          action: Database["public"]["Enums"]["offer_action"]
          actor_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          lead_days: number
          message?: string
          payment_terms: string
          quantity: number
          quote_id: string
          related_offer_id?: string | null
          rfq_id: string
          seq?: never
          supplier_id: string
          unit_price_centavos: number
        }
        Update: {
          action?: Database["public"]["Enums"]["offer_action"]
          actor_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          lead_days?: number
          message?: string
          payment_terms?: string
          quantity?: number
          quote_id?: string
          related_offer_id?: string | null
          rfq_id?: string
          seq?: never
          supplier_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_related_offer_id_fkey"
            columns: ["related_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          commission_bps: number
          commission_centavos: number
          id: string
          line_total_centavos: number
          order_id: string
          product_id: string | null
          quantity: number
          return_class: Database["public"]["Enums"]["return_class"]
          title: string
          unit: Database["public"]["Enums"]["product_unit"]
          unit_price_centavos: number
          variant_id: string | null
          variant_name: string
        }
        Insert: {
          commission_bps: number
          commission_centavos: number
          id?: string
          line_total_centavos: number
          order_id: string
          product_id?: string | null
          quantity: number
          return_class: Database["public"]["Enums"]["return_class"]
          title: string
          unit: Database["public"]["Enums"]["product_unit"]
          unit_price_centavos: number
          variant_id?: string | null
          variant_name?: string
        }
        Update: {
          commission_bps?: number
          commission_centavos?: number
          id?: string
          line_total_centavos?: number
          order_id?: string
          product_id?: string | null
          quantity?: number
          return_class?: Database["public"]["Enums"]["return_class"]
          title?: string
          unit?: Database["public"]["Enums"]["product_unit"]
          unit_price_centavos?: number
          variant_id?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          reason: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id: string
          reason?: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id?: string
          reason?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          cancelled_at: string | null
          checkout_id: string
          commission_centavos: number
          created_at: string
          delivered_at: string | null
          delivery_claimed_at: string | null
          downpayment_centavos: number
          fees_centavos: number
          fulfilment_mode: Database["public"]["Enums"]["fulfilment_mode"]
          gateway_fee_centavos: number
          id: string
          items_centavos: number
          paid_at: string | null
          paid_online_centavos: number
          payment_option: Database["public"]["Enums"]["payment_option"]
          proof_approved_at: string | null
          ref: string
          refused_at: string | null
          ship_to: Json | null
          shipping_centavos: number
          status: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          total_centavos: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          cancelled_at?: string | null
          checkout_id: string
          commission_centavos?: number
          created_at?: string
          delivered_at?: string | null
          delivery_claimed_at?: string | null
          downpayment_centavos?: number
          fees_centavos?: number
          fulfilment_mode?: Database["public"]["Enums"]["fulfilment_mode"]
          gateway_fee_centavos?: number
          id?: string
          items_centavos: number
          paid_at?: string | null
          paid_online_centavos?: number
          payment_option?: Database["public"]["Enums"]["payment_option"]
          proof_approved_at?: string | null
          ref?: string
          refused_at?: string | null
          ship_to?: Json | null
          shipping_centavos?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          total_centavos: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          cancelled_at?: string | null
          checkout_id?: string
          commission_centavos?: number
          created_at?: string
          delivered_at?: string | null
          delivery_claimed_at?: string | null
          downpayment_centavos?: number
          fees_centavos?: number
          fulfilment_mode?: Database["public"]["Enums"]["fulfilment_mode"]
          gateway_fee_centavos?: number
          id?: string
          items_centavos?: number
          paid_at?: string | null
          paid_online_centavos?: number
          payment_option?: Database["public"]["Enums"]["payment_option"]
          proof_approved_at?: string | null
          ref?: string
          refused_at?: string | null
          ship_to?: Json | null
          shipping_centavos?: number
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id?: string
          total_centavos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_id: string
          id: number
          payload: Json
          provider: string
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          id?: never
          payload?: Json
          provider: string
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          id?: never
          payload?: Json
          provider?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_centavos: number
          checkout_id: string
          created_at: string
          fee_centavos: number | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string | null
          provider: string | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_centavos: number
          checkout_id: string
          created_at?: string
          fee_centavos?: number | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          provider?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_centavos?: number
          checkout_id?: string
          created_at?: string
          fee_centavos?: number | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          provider?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: true
            referencedRelation: "checkouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount_centavos: number
          order_id: string
          payout_id: string
        }
        Insert: {
          amount_centavos: number
          order_id: string
          payout_id: string
        }
        Update: {
          amount_centavos?: number
          order_id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_centavos: number
          id: string
          provider_ref: string
          ref: string
          released_at: string | null
          released_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["payout_status"]
          supplier_id: string
        }
        Insert: {
          amount_centavos: number
          id?: string
          provider_ref?: string
          ref?: string
          released_at?: string | null
          released_by?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
          supplier_id: string
        }
        Update: {
          amount_centavos?: number
          id?: string
          provider_ref?: string
          ref?: string
          released_at?: string | null
          released_by?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      product_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price_delta_centavos: number
          product_id: string
          sort_order: number
          stock: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price_delta_centavos?: number
          product_id: string
          sort_order?: number
          stock?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price_delta_centavos?: number
          product_id?: string
          sort_order?: number
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
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
          stock: number | null
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
          stock?: number | null
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
          stock?: number | null
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
      proofs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string
          order_id: string
          responded_at: string | null
          responded_by: string | null
          response_note: string
          status: Database["public"]["Enums"]["proof_status"]
          storage_path: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note?: string
          order_id: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string
          status?: Database["public"]["Enums"]["proof_status"]
          storage_path: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          order_id?: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string
          status?: Database["public"]["Enums"]["proof_status"]
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          bir_invoice: Database["public"]["Enums"]["bir_invoice"]
          created_at: string
          created_by: string | null
          delivery_terms: Database["public"]["Enums"]["delivery_terms"]
          id: string
          idempotency_key: string
          lead_days: number
          notes: string
          payment_terms: string
          price_tiers: Json
          quantity: number
          ref: string
          revision: number
          rfq_id: string
          setup_fee_centavos: number | null
          shipping_fee_centavos: number | null
          supplier_id: string
          tax_centavos: number | null
          unit_price_centavos: number
          valid_until: string
        }
        Insert: {
          bir_invoice: Database["public"]["Enums"]["bir_invoice"]
          created_at?: string
          created_by?: string | null
          delivery_terms: Database["public"]["Enums"]["delivery_terms"]
          id?: string
          idempotency_key: string
          lead_days: number
          notes?: string
          payment_terms: string
          price_tiers?: Json
          quantity: number
          ref?: string
          revision: number
          rfq_id: string
          setup_fee_centavos?: number | null
          shipping_fee_centavos?: number | null
          supplier_id: string
          tax_centavos?: number | null
          unit_price_centavos: number
          valid_until: string
        }
        Update: {
          bir_invoice?: Database["public"]["Enums"]["bir_invoice"]
          created_at?: string
          created_by?: string | null
          delivery_terms?: Database["public"]["Enums"]["delivery_terms"]
          id?: string
          idempotency_key?: string
          lead_days?: number
          notes?: string
          payment_terms?: string
          price_tiers?: Json
          quantity?: number
          ref?: string
          revision?: number
          rfq_id?: string
          setup_fee_centavos?: number | null
          shipping_fee_centavos?: number | null
          supplier_id?: string
          tax_centavos?: number | null
          unit_price_centavos?: number
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_centavos: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          order_id: string | null
          payment_id: string
          provider_refund_ref: string | null
          reason: string
          requested_by: string | null
          status: Database["public"]["Enums"]["refund_status"]
        }
        Insert: {
          amount_centavos: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          order_id?: string | null
          payment_id: string
          provider_refund_ref?: string | null
          reason: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Update: {
          amount_centavos?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          order_id?: string | null
          payment_id?: string
          provider_refund_ref?: string | null
          reason?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          buyer_id: string
          created_at: string
          hidden: boolean
          hidden_reason: string
          id: string
          order_id: string
          rating: number
          replied_at: string | null
          supplier_id: string
          supplier_reply: string
        }
        Insert: {
          body?: string
          buyer_id: string
          created_at?: string
          hidden?: boolean
          hidden_reason?: string
          id?: string
          order_id: string
          rating: number
          replied_at?: string | null
          supplier_id: string
          supplier_reply?: string
        }
        Update: {
          body?: string
          buyer_id?: string
          created_at?: string
          hidden?: boolean
          hidden_reason?: string
          id?: string
          order_id?: string
          rating?: number
          replied_at?: string | null
          supplier_id?: string
          supplier_reply?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_invites: {
        Row: {
          auto: boolean
          created_at: string
          invited_by: string | null
          responded_at: string | null
          rfq_id: string
          status: Database["public"]["Enums"]["invite_status"]
          supplier_id: string
        }
        Insert: {
          auto?: boolean
          created_at?: string
          invited_by?: string | null
          responded_at?: string | null
          rfq_id: string
          status?: Database["public"]["Enums"]["invite_status"]
          supplier_id: string
        }
        Update: {
          auto?: boolean
          created_at?: string
          invited_by?: string | null
          responded_at?: string | null
          rfq_id?: string
          status?: Database["public"]["Enums"]["invite_status"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invites_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invites_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_messages: {
        Row: {
          body: string
          created_at: string
          id: number
          rfq_id: string
          sender_id: string
          supplier_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          rfq_id: string
          sender_id: string
          supplier_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          rfq_id?: string
          sender_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_messages_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["rfq_status"] | null
          id: number
          reason: string
          rfq_id: string
          to_status: Database["public"]["Enums"]["rfq_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["rfq_status"] | null
          id?: never
          reason?: string
          rfq_id: string
          to_status: Database["public"]["Enums"]["rfq_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["rfq_status"] | null
          id?: never
          reason?: string
          rfq_id?: string
          to_status?: Database["public"]["Enums"]["rfq_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rfq_status_history_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          budget_centavos: number | null
          buyer_id: string
          category_id: string | null
          city: string
          created_at: string
          delivery_preference: Database["public"]["Enums"]["delivery_preference"]
          description: string
          id: string
          idempotency_key: string
          needs_bir_invoice: boolean
          product: string
          province: string
          quantity: number | null
          ref: string
          required_by: string | null
          review_note: string
          sharing_consent: boolean
          specs: string
          status: Database["public"]["Enums"]["rfq_status"]
          submitted_at: string | null
          unit: Database["public"]["Enums"]["product_unit"]
          updated_at: string
        }
        Insert: {
          budget_centavos?: number | null
          buyer_id: string
          category_id?: string | null
          city?: string
          created_at?: string
          delivery_preference?: Database["public"]["Enums"]["delivery_preference"]
          description?: string
          id?: string
          idempotency_key: string
          needs_bir_invoice?: boolean
          product: string
          province?: string
          quantity?: number | null
          ref?: string
          required_by?: string | null
          review_note?: string
          sharing_consent?: boolean
          specs?: string
          status?: Database["public"]["Enums"]["rfq_status"]
          submitted_at?: string | null
          unit?: Database["public"]["Enums"]["product_unit"]
          updated_at?: string
        }
        Update: {
          budget_centavos?: number | null
          buyer_id?: string
          category_id?: string | null
          city?: string
          created_at?: string
          delivery_preference?: Database["public"]["Enums"]["delivery_preference"]
          description?: string
          id?: string
          idempotency_key?: string
          needs_bir_invoice?: boolean
          product?: string
          province?: string
          quantity?: number | null
          ref?: string
          required_by?: string | null
          review_note?: string
          sharing_consent?: boolean
          specs?: string
          status?: Database["public"]["Enums"]["rfq_status"]
          submitted_at?: string | null
          unit?: Database["public"]["Enums"]["product_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
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
      selections: {
        Row: {
          amount_centavos: number
          amount_is_estimate: boolean
          buyer_id: string
          created_at: string
          id: string
          offer_id: string | null
          quote_id: string
          ref: string
          rfq_id: string
          supplier_id: string
        }
        Insert: {
          amount_centavos: number
          amount_is_estimate: boolean
          buyer_id: string
          created_at?: string
          id?: string
          offer_id?: string | null
          quote_id: string
          ref?: string
          rfq_id: string
          supplier_id: string
        }
        Update: {
          amount_centavos?: number
          amount_is_estimate?: boolean
          buyer_id?: string
          created_at?: string
          id?: string
          offer_id?: string | null
          quote_id?: string
          ref?: string
          rfq_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selections_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: true
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string
          cod_amount_centavos: number
          created_at: string
          id: string
          order_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_ref: string
          updated_at: string
        }
        Insert: {
          carrier: string
          cod_amount_centavos?: number
          created_at?: string
          id?: string
          order_id: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_ref: string
          updated_at?: string
        }
        Update: {
          carrier?: string
          cod_amount_centavos?: number
          created_at?: string
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_ref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string | null
          checkout_id: string | null
          created_at: string
          delta: number
          id: number
          product_id: string
          reason: Database["public"]["Enums"]["stock_reason"]
          variant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          checkout_id?: string | null
          created_at?: string
          delta: number
          id?: never
          product_id: string
          reason: Database["public"]["Enums"]["stock_reason"]
          variant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          checkout_id?: string | null
          created_at?: string
          delta?: number
          id?: never
          product_id?: string
          reason?: Database["public"]["Enums"]["stock_reason"]
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          checkout_id: string
          created_at: string
          id: string
          order_id: string | null
          product_id: string
          quantity: number
          status: string
          variant_id: string | null
        }
        Insert: {
          checkout_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          product_id: string
          quantity: number
          status?: string
          variant_id?: string | null
        }
        Update: {
          checkout_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string
          quantity?: number
          status?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
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
          auto_invites: boolean
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
          restocking_fee_bps: number
          reviewed_at: string | null
          status: Database["public"]["Enums"]["supplier_status"]
          submitted_at: string
          updated_at: string
          years_operating: number | null
        }
        Insert: {
          auto_invites?: boolean
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
          restocking_fee_bps?: number
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          submitted_at?: string
          updated_at?: string
          years_operating?: number | null
        }
        Update: {
          auto_invites?: boolean
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
          restocking_fee_bps?: number
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
      tracking_events: {
        Row: {
          carrier: string
          event_id: string
          id: number
          note: string
          occurred_at: string
          payload: Json
          received_at: string
          shipment_id: string
          status: Database["public"]["Enums"]["shipment_status"]
        }
        Insert: {
          carrier: string
          event_id: string
          id?: never
          note?: string
          occurred_at: string
          payload?: Json
          received_at?: string
          shipment_id: string
          status: Database["public"]["Enums"]["shipment_status"]
        }
        Update: {
          carrier?: string
          event_id?: string
          id?: never
          note?: string
          occurred_at?: string
          payload?: Json
          received_at?: string
          shipment_id?: string
          status?: Database["public"]["Enums"]["shipment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ledger_balances: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"] | null
          balance_centavos: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ratings: {
        Row: {
          average_rating: number | null
          review_count: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_artwork: {
        Args: {
          p_file_name: string
          p_note?: string
          p_order_id: string
          p_storage_path: string
        }
        Returns: string
      }
      add_claim_message: {
        Args: { p_body: string; p_claim_id: string }
        Returns: undefined
      }
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
      admin_create_refund: {
        Args: {
          p_amount_centavos: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
        }
        Returns: string
      }
      admin_decide_claim: {
        Args: {
          p_claim_id: string
          p_note: string
          p_outcome: string
          p_refund_centavos: number
          p_return_required: boolean
        }
        Returns: undefined
      }
      admin_grant_role: {
        Args: {
          p_sub_role: Database["public"]["Enums"]["admin_sub_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_hide_review: {
        Args: { p_hidden: boolean; p_reason: string; p_review_id: string }
        Returns: undefined
      }
      admin_invite_suppliers: {
        Args: { p_rfq_id: string; p_supplier_ids: string[] }
        Returns: number
      }
      admin_refund_unmatched: {
        Args: { p_idempotency_key: string; p_payment_id: string }
        Returns: string
      }
      admin_release_payout: {
        Args: { p_payout_id: string; p_provider_ref?: string }
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
      admin_review_rfq: {
        Args: { p_decision: string; p_note?: string; p_rfq_id: string }
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
      admin_suggest_suppliers: {
        Args: { p_rfq_id: string }
        Returns: {
          score: number
          supplier_id: string
        }[]
      }
      admin_update_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      attach_payment_session: {
        Args: {
          p_checkout_id: string
          p_provider: string
          p_provider_ref: string
        }
        Returns: undefined
      }
      cancel_claim: { Args: { p_claim_id: string }; Returns: undefined }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: string
      }
      cancel_rfq: {
        Args: { p_reason?: string; p_rfq_id: string }
        Returns: undefined
      }
      commission_rate_bps: {
        Args: { p_at?: string; p_category_id: string }
        Returns: number
      }
      complete_refund: {
        Args: {
          p_provider_refund_ref: string
          p_refund_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      confirm_delivery: { Args: { p_order_id: string }; Returns: undefined }
      confirm_payment: {
        Args: {
          p_amount_centavos: number
          p_event_id: string
          p_fee_centavos: number
          p_payload: Json
          p_provider: string
          p_provider_ref: string
        }
        Returns: string
      }
      confirm_return_received: {
        Args: { p_claim_id: string }
        Returns: undefined
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
      escalate_claim: {
        Args: { p_claim_id: string; p_note?: string }
        Returns: undefined
      }
      fail_payment: {
        Args: {
          p_event_id: string
          p_payload: Json
          p_provider: string
          p_provider_ref: string
        }
        Returns: string
      }
      has_admin_role: {
        Args: { roles: Database["public"]["Enums"]["admin_sub_role"][] }
        Returns: boolean
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_rfq_buyer: { Args: { p_rfq_id: string }; Returns: boolean }
      make_offer: {
        Args: {
          p_action: Database["public"]["Enums"]["offer_action"]
          p_idempotency_key: string
          p_lead_days: number
          p_message: string
          p_payment_terms: string
          p_quantity: number
          p_related_offer_id: string
          p_rfq_id: string
          p_supplier_id: string
          p_unit_price_centavos: number
        }
        Returns: string
      }
      mark_delivered: { Args: { p_order_id: string }; Returns: undefined }
      mark_notifications_read: { Args: never; Returns: undefined }
      mark_replacement_sent: {
        Args: { p_claim_id: string; p_note?: string }
        Returns: undefined
      }
      mark_shipped: { Args: { p_order_id: string }; Returns: undefined }
      my_supplier_id: { Args: never; Returns: string }
      open_claim: {
        Args: {
          p_claim_id: string
          p_description: string
          p_evidence: Json
          p_item_ids: string[]
          p_order_id: string
          p_type: Database["public"]["Enums"]["claim_type"]
        }
        Returns: string
      }
      post_review: {
        Args: { p_body: string; p_order_id: string; p_rating: number }
        Returns: string
      }
      record_manual_refund: {
        Args: { p_claim_id: string; p_reference: string }
        Returns: undefined
      }
      record_return_shipment: {
        Args: { p_claim_id: string; p_tracking_ref: string }
        Returns: undefined
      }
      record_shipment: {
        Args: { p_carrier: string; p_order_id: string; p_tracking_ref: string }
        Returns: string
      }
      record_tracking_event: {
        Args: {
          p_carrier: string
          p_cod_collected_centavos: number
          p_event_id: string
          p_note: string
          p_occurred_at: string
          p_payload: Json
          p_status: Database["public"]["Enums"]["shipment_status"]
          p_tracking_ref: string
        }
        Returns: string
      }
      reply_review: {
        Args: { p_reply: string; p_review_id: string }
        Returns: undefined
      }
      respond_claim: {
        Args: {
          p_accept: boolean
          p_claim_id: string
          p_note: string
          p_refund_centavos: number
          p_remedy: Database["public"]["Enums"]["claim_remedy"]
          p_return_required: boolean
        }
        Returns: undefined
      }
      respond_proof: {
        Args: { p_approve: boolean; p_note?: string; p_proof_id: string }
        Returns: undefined
      }
      respond_rfq_invite: {
        Args: { p_accept: boolean; p_rfq_id: string }
        Returns: undefined
      }
      save_rfq: {
        Args: {
          p_budget_centavos: number
          p_category_slug: string
          p_city: string
          p_delivery_preference: Database["public"]["Enums"]["delivery_preference"]
          p_description: string
          p_idempotency_key: string
          p_needs_bir_invoice: boolean
          p_product: string
          p_province: string
          p_quantity: number
          p_required_by: string
          p_rfq_id: string
          p_sharing_consent: boolean
          p_specs: string
          p_submit: boolean
          p_unit: Database["public"]["Enums"]["product_unit"]
        }
        Returns: string
      }
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
      select_supplier: {
        Args: { p_offer_id?: string; p_quote_id: string; p_rfq_id: string }
        Returns: string
      }
      send_proof: {
        Args: { p_note?: string; p_order_id: string; p_storage_path: string }
        Returns: string
      }
      send_rfq_message: {
        Args: { p_body: string; p_rfq_id: string; p_supplier_id: string }
        Returns: number
      }
      set_product_variants: {
        Args: { p_product_id: string; p_variants: Json }
        Returns: undefined
      }
      set_stock: {
        Args: { p_product_id: string; p_stock: number; p_variant_id: string }
        Returns: undefined
      }
      start_checkout: {
        Args: {
          p_address_id: string
          p_idempotency_key: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_payment_option?: Database["public"]["Enums"]["payment_option"]
        }
        Returns: {
          amount_centavos: number
          checkout_id: string
        }[]
      }
      start_production: { Args: { p_order_id: string }; Returns: undefined }
      start_selection_checkout: {
        Args: {
          p_address_id: string
          p_idempotency_key: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_selection_id: string
        }
        Returns: {
          amount_centavos: number
          checkout_id: string
        }[]
      }
      submit_product: { Args: { p_product_id: string }; Returns: undefined }
      submit_quote: {
        Args: {
          p_bir_invoice: Database["public"]["Enums"]["bir_invoice"]
          p_delivery_terms: Database["public"]["Enums"]["delivery_terms"]
          p_idempotency_key: string
          p_lead_days: number
          p_notes: string
          p_payment_terms: string
          p_price_tiers?: Json
          p_quantity: number
          p_rfq_id: string
          p_setup_fee_centavos: number
          p_shipping_fee_centavos: number
          p_tax_centavos: number
          p_unit_price_centavos: number
          p_valid_until: string
        }
        Returns: string
      }
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
      bir_invoice: "vat" | "non_vat" | "none"
      business_type:
        | "manufacturer"
        | "supplier"
        | "wholesaler"
        | "distributor"
        | "service_provider"
      checkout_status:
        | "pending"
        | "paid"
        | "expired"
        | "cancelled"
        | "needs_review"
      claim_remedy: "refund" | "replacement"
      claim_status:
        | "open"
        | "awaiting_return"
        | "refund_pending"
        | "replacement_pending"
        | "rejected"
        | "escalated"
        | "declined"
        | "resolved"
        | "cancelled"
      claim_type: "damage" | "return" | "defect"
      delivery_preference:
        | "supplier_delivery"
        | "buyer_pickup"
        | "third_party_freight"
        | "any"
      delivery_terms:
        | "supplier_delivery"
        | "buyer_pickup"
        | "third_party_freight"
      fulfilment_mode:
        | "courier"
        | "supplier_delivery"
        | "buyer_pickup"
        | "freight"
      invite_status: "invited" | "accepted" | "declined"
      ledger_account:
        | "gateway_clearing"
        | "supplier_payable"
        | "platform_revenue"
        | "unmatched_payments"
      listing_type: "product" | "service"
      offer_action: "counter" | "accept" | "decline"
      order_status:
        | "pending_payment"
        | "paid"
        | "confirmed"
        | "in_production"
        | "shipped"
        | "delivered"
        | "completed"
        | "cancelled"
      payment_method: "card" | "ewallet" | "online_banking"
      payment_option: "online" | "cod"
      payment_status: "pending" | "paid" | "failed" | "expired" | "needs_review"
      payout_status: "scheduled" | "released"
      product_status: "draft" | "pending" | "approved" | "rejected"
      product_unit: "pcs" | "boxes" | "packs" | "sets" | "kg"
      proof_status: "sent" | "approved" | "changes_requested"
      refund_status: "pending" | "succeeded" | "failed"
      return_class: "standard" | "custom" | "final_sale"
      rfq_status:
        | "draft"
        | "under_review"
        | "needs_information"
        | "matching"
        | "invited"
        | "quoting"
        | "supplier_selected"
        | "cancelled"
      saved_kind: "product" | "supplier"
      shipment_status:
        | "booked"
        | "picked_up"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
        | "failed_attempt"
        | "returned"
      stock_reason: "adjust" | "reserve" | "release"
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
      bir_invoice: ["vat", "non_vat", "none"],
      business_type: [
        "manufacturer",
        "supplier",
        "wholesaler",
        "distributor",
        "service_provider",
      ],
      checkout_status: [
        "pending",
        "paid",
        "expired",
        "cancelled",
        "needs_review",
      ],
      claim_remedy: ["refund", "replacement"],
      claim_status: [
        "open",
        "awaiting_return",
        "refund_pending",
        "replacement_pending",
        "rejected",
        "escalated",
        "declined",
        "resolved",
        "cancelled",
      ],
      claim_type: ["damage", "return", "defect"],
      delivery_preference: [
        "supplier_delivery",
        "buyer_pickup",
        "third_party_freight",
        "any",
      ],
      delivery_terms: [
        "supplier_delivery",
        "buyer_pickup",
        "third_party_freight",
      ],
      fulfilment_mode: [
        "courier",
        "supplier_delivery",
        "buyer_pickup",
        "freight",
      ],
      invite_status: ["invited", "accepted", "declined"],
      ledger_account: [
        "gateway_clearing",
        "supplier_payable",
        "platform_revenue",
        "unmatched_payments",
      ],
      listing_type: ["product", "service"],
      offer_action: ["counter", "accept", "decline"],
      order_status: [
        "pending_payment",
        "paid",
        "confirmed",
        "in_production",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
      ],
      payment_method: ["card", "ewallet", "online_banking"],
      payment_option: ["online", "cod"],
      payment_status: ["pending", "paid", "failed", "expired", "needs_review"],
      payout_status: ["scheduled", "released"],
      product_status: ["draft", "pending", "approved", "rejected"],
      product_unit: ["pcs", "boxes", "packs", "sets", "kg"],
      proof_status: ["sent", "approved", "changes_requested"],
      refund_status: ["pending", "succeeded", "failed"],
      return_class: ["standard", "custom", "final_sale"],
      rfq_status: [
        "draft",
        "under_review",
        "needs_information",
        "matching",
        "invited",
        "quoting",
        "supplier_selected",
        "cancelled",
      ],
      saved_kind: ["product", "supplier"],
      shipment_status: [
        "booked",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "failed_attempt",
        "returned",
      ],
      stock_reason: ["adjust", "reserve", "release"],
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

