// Frame Ops — 공통 타입 정의
// 실제 Supabase DB 스키마 기반 (fo_brands, fo_products, fo_sales)

// ── 매장 ──────────────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  store_code: string;
  store_name: string;
  address?: string;
  phone?: string;
  created_at: string;
}

// ── 브랜드 (fo_brands) ────────────────────────────────────────────────────────
export interface Brand {
  id: string;
  name: string;         // fo_brands.name
  created_at: string;
  updated_at: string;
}

// ── 제품 / 프레임 (fo_products) ───────────────────────────────────────────────
export interface Product {
  id: string;
  brand_id: string;
  product_code: string;
  style_code: string;
  color_code: string;
  display_name?: string;
  category?: string;
  sale_price?: number;
  cost_price?: number;
  suggested_retail?: number;
  barcode?: string;
  product_line?: string;
  supplier_id?: string;
  status: 'active' | 'inactive';
  image_url?: string;
  created_at: string;
  updated_at: string;
  // 조인
  brand?: Brand;
}

// ── 매출 (fo_sales) ───────────────────────────────────────────────────────────
export interface Sale {
  id: string;
  store_id: string;
  sold_at: string;
  cash_amount: number;
  card_amount: number;
  discount_total: number;
  discount_type_code?: string | null;
  idempotency_key?: string;
  clerk_note?: string | null;
  seller_code?: string;
  seller_user_id?: string;
  seller_label?: string;
  created_at: string;
}

// ── POS 장바구니 ──────────────────────────────────────────────────────────────
export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
}

export interface PosState {
  cart: CartItem[];
  payment_method?: string;
  paid_amount: number;
}

// ── 공통 유틸 타입 ────────────────────────────────────────────────────────────
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type SortDirection = 'asc' | 'desc';

export interface TableFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: SortDirection;
  [key: string]: unknown;
}
