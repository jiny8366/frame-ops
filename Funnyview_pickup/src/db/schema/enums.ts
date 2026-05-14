import { pgEnum } from 'drizzle-orm/pg-core';

// 사용자 역할
export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'warehouse_staff',
  'store_staff',
  'admin',
]);

// 성별
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

// 좌/우/양안
export const eyeSideEnum = pgEnum('eye_side', ['left', 'right', 'both']);

// 렌즈 유형
export const lensTypeEnum = pgEnum('lens_type', [
  'spherical', // 일반
  'toric', // 난시
  'multifocal', // 다초점
  'color', // 컬러
  'circle', // 써클
]);

// 교체 주기
export const replacementCycleEnum = pgEnum('replacement_cycle', [
  '1day',
  '2week',
  '1month',
  '3month',
  '6month',
  '1year',
]);

// 주문 상태
//  pending     주문완료 (결제 전 또는 결제 처리 중)
//  paid        결제완료 → 픽업서비스 업체에 신규 주문으로 노출
//  accepted    픽업서비스 업체 접수
//  picking     패킹 중
//  shipped     출고 (= 고객/가맹점 화면 '배송 중')
//  arrived     가맹점 입고
//  ready       픽업 준비 완료 (도착알림 발송 시점)
//  completed   픽업 + 결제 완료 (처리완료)
//  cancelled   취소
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'accepted',
  'picking',
  'shipped',
  'arrived',
  'ready',
  'completed',
  'cancelled',
]);

// 결제 수단
export const paymentMethodEnum = pgEnum('payment_method', [
  'card',
  'cash',
  'bank_transfer',
  'point',
  'mixed',
]);

// 결제 상태
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'completed',
  'failed',
  'refunded',
  'partial_refund',
]);

// 결제 발생 장소
export const paymentVenueEnum = pgEnum('payment_venue', [
  'online', // 주문 시 온라인 선결제
  'store', // 픽업 시 매장 결제
]);

// 재고 이동 유형
export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', [
  'inbound', // 입고
  'outbound', // 출고
  'reserve', // 주문 예약
  'release', // 예약 해제
  'adjust', // 재고 조정
  'return', // 반품 입고
]);

// 알림 유형
export const notificationTypeEnum = pgEnum('notification_type', [
  'order_received', // 주문 접수 (warehouse 대상)
  'order_shipped', // 배송 시작 (customer + store 대상)
  'order_arrived', // 가맹점 입고 (store 대상)
  'pickup_ready', // 픽업 가능 (customer 대상, 도착알림)
  'pickup_completed', // 픽업 완료 (customer 대상)
  'low_stock', // 안전재고 부족 (warehouse 대상)
]);

// 알림 채널
export const notificationChannelEnum = pgEnum('notification_channel', [
  'app', // 앱 인앱 알림
  'sms',
  'kakao',
  'email',
]);

// 알림 상태
export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'sent',
  'failed',
  'read',
]);
