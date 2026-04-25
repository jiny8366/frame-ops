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
      fo_brands: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      fo_discount_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      fo_inbound_lines: {
        Row: {
          id: string
          inbound_receipt_id: string
          product_id: string
          quantity: number
          sale_price_override: number | null
          unit_cost: number
        }
        Insert: {
          id?: string
          inbound_receipt_id: string
          product_id: string
          quantity: number
          sale_price_override?: number | null
          unit_cost?: number
        }
        Update: {
          id?: string
          inbound_receipt_id?: string
          product_id?: string
          quantity?: number
          sale_price_override?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_inbound_lines_inbound_receipt_id_fkey"
            columns: ["inbound_receipt_id"]
            isOneToOne: false
            referencedRelation: "fo_inbound_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_inbound_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_inbound_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_inbound_receipts: {
        Row: {
          created_at: string
          document_at: string
          id: string
          note: string | null
          store_id: string
          supplier_id: string | null
        }
        Insert: {
          created_at?: string
          document_at?: string
          id?: string
          note?: string | null
          store_id: string
          supplier_id?: string | null
        }
        Update: {
          created_at?: string
          document_at?: string
          id?: string
          note?: string | null
          store_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fo_inbound_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_inbound_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fo_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_interstore_transfer_lines: {
        Row: {
          id: string
          product_id: string
          quantity: number
          transfer_id: string
          unit_cost: number
        }
        Insert: {
          id?: string
          product_id: string
          quantity: number
          transfer_id: string
          unit_cost?: number
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          transfer_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_interstore_transfer_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_interstore_transfer_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_interstore_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "fo_interstore_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_interstore_transfers: {
        Row: {
          created_at: string
          decided_at: string | null
          document_at: string
          from_store_id: string
          hold_note: string | null
          id: string
          note: string | null
          reject_note: string | null
          status: string
          to_store_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          document_at: string
          from_store_id: string
          hold_note?: string | null
          id?: string
          note?: string | null
          reject_note?: string | null
          status?: string
          to_store_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          document_at?: string
          from_store_id?: string
          hold_note?: string | null
          id?: string
          note?: string | null
          reject_note?: string | null
          status?: string
          to_store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_interstore_transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_interstore_transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_outbound_lines: {
        Row: {
          id: string
          outbound_shipment_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          id?: string
          outbound_shipment_id: string
          product_id: string
          quantity: number
        }
        Update: {
          id?: string
          outbound_shipment_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_outbound_lines_outbound_shipment_id_fkey"
            columns: ["outbound_shipment_id"]
            isOneToOne: false
            referencedRelation: "fo_outbound_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_outbound_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_outbound_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_outbound_shipments: {
        Row: {
          created_at: string
          document_at: string
          id: string
          note: string | null
          reason: string
          store_id: string
        }
        Insert: {
          created_at?: string
          document_at?: string
          id?: string
          note?: string | null
          reason?: string
          store_id: string
        }
        Update: {
          created_at?: string
          document_at?: string
          id?: string
          note?: string | null
          reason?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_outbound_shipments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_product_categories: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      fo_products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category: string
          color_code: string | null
          cost_price: number
          created_at: string
          display_name: string
          id: string
          product_code: string
          product_line: string | null
          sale_price: number
          status: string
          stock_quantity: number | null
          style_code: string | null
          suggested_retail: number
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category?: string
          color_code?: string | null
          cost_price?: number
          created_at?: string
          display_name: string
          id?: string
          product_code: string
          product_line?: string | null
          sale_price?: number
          status?: string
          stock_quantity?: number | null
          style_code?: string | null
          suggested_retail?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category?: string
          color_code?: string | null
          cost_price?: number
          created_at?: string
          display_name?: string
          id?: string
          product_code?: string
          product_line?: string | null
          sale_price?: number
          status?: string
          stock_quantity?: number | null
          style_code?: string | null
          suggested_retail?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "fo_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fo_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_purchase_order_lines: {
        Row: {
          id: string
          line_status: string
          product_id: string
          quantity: number
          sheet_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          line_status?: string
          product_id: string
          quantity: number
          sheet_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          line_status?: string
          product_id?: string
          quantity?: number
          sheet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_purchase_order_lines_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "fo_purchase_order_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_purchase_order_sheets: {
        Row: {
          created_at: string
          id: string
          note: string | null
          period_end: string
          period_start: string
          store_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          period_end: string
          period_start: string
          store_id: string
          title?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          period_end?: string
          period_start?: string
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_purchase_order_sheets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_return_lines: {
        Row: {
          id: string
          is_damage_loss: boolean
          product_id: string
          quantity: number
          return_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          is_damage_loss?: boolean
          product_id: string
          quantity: number
          return_id: string
          unit_price?: number
        }
        Update: {
          id?: string
          is_damage_loss?: boolean
          product_id?: string
          quantity?: number
          return_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_return_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_return_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "fo_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_returns: {
        Row: {
          created_at: string
          id: string
          note: string | null
          original_sale_id: string | null
          returned_at: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          original_sale_id?: string | null
          returned_at: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          original_sale_id?: string | null
          returned_at?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_returns_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "fo_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_sale_items: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          line_note: string | null
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          id?: string
          line_note?: string | null
          product_id: string
          quantity?: number
          sale_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          line_note?: string | null
          product_id?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "fo_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_sale_lines: {
        Row: {
          cost_price_at_sale: number | null
          id: string
          line_discount: number
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          cost_price_at_sale?: number | null
          id?: string
          line_discount?: number
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Update: {
          cost_price_at_sale?: number | null
          id?: string
          line_discount?: number
          product_id?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "fo_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_sales: {
        Row: {
          card_amount: number
          cash_amount: number
          clerk_note: string | null
          created_at: string
          discount_total: number
          discount_type_code: string | null
          id: string
          idempotency_key: string | null
          seller_code: string | null
          seller_label: string | null
          seller_user_id: string | null
          sold_at: string
          store_id: string
        }
        Insert: {
          card_amount?: number
          cash_amount?: number
          clerk_note?: string | null
          created_at?: string
          discount_total?: number
          discount_type_code?: string | null
          id?: string
          idempotency_key?: string | null
          seller_code?: string | null
          seller_label?: string | null
          seller_user_id?: string | null
          sold_at?: string
          store_id: string
        }
        Update: {
          card_amount?: number
          cash_amount?: number
          clerk_note?: string | null
          created_at?: string
          discount_total?: number
          discount_type_code?: string | null
          id?: string
          idempotency_key?: string | null
          seller_code?: string | null
          seller_label?: string | null
          seller_user_id?: string | null
          sold_at?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_settlement_expenses: {
        Row: {
          amount: number
          created_at: string
          id: string
          memo: string | null
          settlement_id: string
          sort_order: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          memo?: string | null
          settlement_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          memo?: string | null
          settlement_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fo_settlement_expenses_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "fo_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_settlements: {
        Row: {
          business_date: string
          card_sales: number
          cash_counted: number | null
          cash_expected: number | null
          cash_on_hand: number
          created_at: string
          deposit: number
          id: string
          note: string | null
          store_id: string
          total_expense: number
          variance: number | null
        }
        Insert: {
          business_date: string
          card_sales?: number
          cash_counted?: number | null
          cash_expected?: number | null
          cash_on_hand?: number
          created_at?: string
          deposit?: number
          id?: string
          note?: string | null
          store_id: string
          total_expense?: number
          variance?: number | null
        }
        Update: {
          business_date?: string
          card_sales?: number
          cash_counted?: number | null
          cash_expected?: number | null
          cash_on_hand?: number
          created_at?: string
          deposit?: number
          id?: string
          note?: string | null
          store_id?: string
          total_expense?: number
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fo_settlements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_staff_job_titles: {
        Row: {
          active: boolean
          code: string
          created_at: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      fo_staff_profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          email: string | null
          job_title_code: string | null
          login_id: string | null
          password_hash: string | null
          password_updated_at: string | null
          phone: string | null
          role_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          job_title_code?: string | null
          login_id?: string | null
          password_hash?: string | null
          password_updated_at?: string | null
          phone?: string | null
          role_code: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          job_title_code?: string | null
          login_id?: string | null
          password_hash?: string | null
          password_updated_at?: string | null
          phone?: string | null
          role_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_staff_profiles_job_title_code_fkey"
            columns: ["job_title_code"]
            isOneToOne: false
            referencedRelation: "fo_staff_job_titles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fo_staff_profiles_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "fo_staff_roles"
            referencedColumns: ["code"]
          },
        ]
      }
      fo_staff_roles: {
        Row: {
          code: string
          description: string | null
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          description?: string | null
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          description?: string | null
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      fo_staff_store_scopes: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_staff_store_scopes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_stock: {
        Row: {
          product_id: string
          quantity: number
          store_id: string
          updated_at: string
        }
        Insert: {
          product_id: string
          quantity?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          product_id?: string
          quantity?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_stock_adjustment_lines: {
        Row: {
          id: string
          product_id: string
          quantity_delta: number
          stock_adjustment_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity_delta: number
          stock_adjustment_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity_delta?: number
          stock_adjustment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_stock_adjustment_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stock_adjustment_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stock_adjustment_lines_stock_adjustment_id_fkey"
            columns: ["stock_adjustment_id"]
            isOneToOne: false
            referencedRelation: "fo_stock_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_stock_adjustments: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_name: string | null
          created_at: string
          document_at: string
          id: string
          note: string | null
          reason: string
          status: string
          store_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          created_at?: string
          document_at?: string
          id?: string
          note?: string | null
          reason?: string
          status?: string
          store_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_name?: string | null
          created_at?: string
          document_at?: string
          id?: string
          note?: string | null
          reason?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_stock_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_stock_targets: {
        Row: {
          optimal_quantity: number
          product_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          optimal_quantity?: number
          product_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          optimal_quantity?: number
          product_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_stock_targets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stock_targets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fo_products_clean"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_stock_targets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "fo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_stores: {
        Row: {
          active: boolean
          address: string
          business_reg_no: string
          created_at: string
          id: string
          name: string
          phone: string
          store_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string
          business_reg_no?: string
          created_at?: string
          id?: string
          name: string
          phone?: string
          store_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          business_reg_no?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          store_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      fo_supplier_brands: {
        Row: {
          brand_id: string
          created_at: string
          supplier_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          supplier_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fo_supplier_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "fo_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fo_supplier_brands_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "fo_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_suppliers: {
        Row: {
          active: boolean
          address: string | null
          business_number: string | null
          contact: string | null
          created_at: string
          id: string
          memo: string | null
          name: string
          supplier_code: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          business_number?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          name: string
          supplier_code?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          business_number?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          name?: string
          supplier_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      fo_product_colors_by_style: {
        Row: {
          brand_id: string | null
          color_code: string | null
          style_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fo_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "fo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_product_styles_by_brand: {
        Row: {
          brand_id: string | null
          style_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fo_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "fo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      fo_products_clean: {
        Row: {
          barcode: string | null
          brand_id: string | null
          brand_name: string | null
          category: string | null
          color_code: string | null
          cost_price: number | null
          created_at: string | null
          display_name: string | null
          id: string | null
          product_code: string | null
          product_line: string | null
          sale_price: number | null
          status: string | null
          style_code: string | null
          suggested_retail: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fo_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "fo_brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      close_daily_settlement: {
        Args: {
          p_store_id: string
          p_business_date: string
          p_cash_counted: number
          p_deposit?: number
          p_note?: string | null
          p_expenses?: Json
        }
        Returns: {
          settlement_id: string
          total_cash_sales: number
          total_card_sales: number
          total_expense: number
          cash_expected: number
          variance: number
          cash_on_hand: number
        }[]
      }
      get_daily_settlement_summary: {
        Args: {
          p_store_id: string
          p_business_date: string
        }
        Returns: {
          settlement_id: string | null
          starting_cash: number
          total_cash_sales: number
          total_card_sales: number
          total_expense: number
          cash_counted: number | null
          cash_expected: number | null
          variance: number | null
          deposit: number
          cash_on_hand: number
          note: string | null
          is_closed: boolean
        }[]
      }
      create_inbound_receipt: {
        Args: {
          p_store_id: string
          p_supplier_id?: string | null
          p_document_at?: string | null
          p_note?: string | null
          p_lines?: Json
        }
        Returns: {
          receipt_id: string
          lines_created: number
          total_cost: number
        }[]
      }
      create_sale_with_items: {
        Args: {
          p_card_amount: number
          p_cash_amount: number
          p_clerk_note?: string
          p_discount_total: number
          p_discount_type_code?: string
          p_idempotency_key?: string
          p_items: Json
          p_seller_code?: string
          p_seller_label?: string
          p_seller_user_id?: string
          p_sold_at?: string | null
          p_store_id: string
        }
        Returns: {
          items_created: number
          sale_id: string
          sold_at: string
          total_amount: number
        }[]
      }
      get_pending_stock_items: {
        Args: never
        Returns: {
          brand_name: string
          color_code: string
          display_name: string
          id: string
          pending_count: number
          stock_quantity: number
          style_code: string
        }[]
      }
      search_products_fast: {
        Args: {
          p_brand_id?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: {
          brand_id: string
          brand_name: string
          color_code: string
          display_name: string
          id: string
          match_score: number
          sale_price: number
          status: string
          stock_quantity: number
          style_code: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
