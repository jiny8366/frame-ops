export type OrderStatus =
  | 'pending' // 주문완료 (결제 전)
  | 'paid' // 결제완료
  | 'accepted' // 픽업서비스 업체 접수
  | 'picking' // 패킹 중
  | 'shipped' // 출고 (= 고객/가맹점 화면 '배송 중')
  | 'arrived' // 가맹점 입고
  | 'ready' // 픽업 준비 (도착알림 발송)
  | 'completed' // 처리완료
  | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '주문완료',
  paid: '결제완료',
  accepted: '접수',
  picking: '패킹 중',
  shipped: '배송 중',
  arrived: '입고',
  ready: '픽업 가능',
  completed: '처리완료',
  cancelled: '취소',
};

export type UserRole = 'customer' | 'warehouse_staff' | 'store_staff' | 'admin';
export type EyeSide = 'left' | 'right' | 'both';
