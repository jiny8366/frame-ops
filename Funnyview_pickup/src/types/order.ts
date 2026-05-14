export type OrderStatus =
  | 'pending'      // 주문완료 (결제 직후, 픽업서비스 업체 알림 대기)
  | 'accepted'    // 픽업서비스 업체 접수
  | 'picking'     // 패킹 중
  | 'shipped'     // 출고 (= 고객/가맹점 화면에 '배송 중')
  | 'arrived'     // 가맹점 입고
  | 'completed'   // 처리완료 (고객 픽업 + 결제 완료)
  | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '주문완료',
  accepted: '접수',
  picking: '패킹 중',
  shipped: '배송 중',
  arrived: '입고',
  completed: '처리완료',
  cancelled: '취소',
};

export type UserRole = 'customer' | 'warehouse' | 'store';
