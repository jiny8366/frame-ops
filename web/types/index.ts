// Frame Ops — 공통 타입 정의
// Supabase DB 스키마 기반

// ── 매장 ──────────────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  store_code: string;
  store_name: string;
  address?: string;
  phone?: string;
  created_at: string;
}

// ── 브랜드 ────────────────────────────────────────────────────────────────────
export interface Brand {
  id: string;
  brand_code: string;
  brand_name: string;
  brand_name_en?: string;
  is_active: boolean;
  created_at: string;
}

// ── 제품 ──────────────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  brand_id: string;
  product_code: string;
  style_code: string;
  color_code: string;
  display_name?: string;
  category?: string;
  gender?: string;
  sale_price?: number;
  cost_price?: number;
  is_active: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
  // 조인
  brand?: Brand;
}

// ── 재고 ──────────────────────────────────────────────────────────────────────
export interface Inventory {
  id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  // 조인
  product?: Product;
  store?: Store;
}

// ── 고객 ──────────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone?: string;
  birth_date?: string;
  gender?: 'M' | 'F';
  memo?: string;
  created_at: string;
  updated_at: string;
}

// ── 처방전 ────────────────────────────────────────────────────────────────────
export interface Prescription {
  id: string;
  customer_id: string;
  store_id: string;
  // 우안
  r_sph?: number;
  r_cyl?: number;
  r_axis?: number;
  r_add?: number;
  r_pd?: number;
  // 좌안
  l_sph?: number;
  l_cyl?: number;
  l_axis?: number;
  l_add?: number;
  l_pd?: number;
  // 기타
  va_r?: string;
  va_l?: string;
  memo?: string;
  created_at: string;
}

// ── 주문 / 판매 ───────────────────────────────────────────────────────────────
export interface Order {
  id: string;
  store_id: string;
  customer_id?: string;
  order_number: string;
  order_date: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  total_amount: number;
  paid_amount: number;
  payment_method?: string;
  memo?: string;
  created_at: string;
  updated_at: string;
  // 조인
  customer?: Customer;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
  // 조인
  product?: Product;
}

// ── POS ───────────────────────────────────────────────────────────────────────
export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_price: number;
}

export interface PosState {
  cart: CartItem[];
  customer?: Customer;
  prescription?: Prescription;
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
