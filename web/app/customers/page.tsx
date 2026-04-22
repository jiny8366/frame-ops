// ⛔ 고객 관리는 Frame Ops 범위 밖 — 이 페이지는 사용하지 않음
import { redirect } from 'next/navigation';

export default function CustomersPage() {
  redirect('/');
}
