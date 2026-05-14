import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, users } from '@/db/schema';
import { readSession } from './session';

export interface CurrentUser {
  id: string;
  role: 'customer' | 'warehouse_staff' | 'store_staff' | 'admin';
  phone: string | null;
  email: string | null;
  storeId: string | null;
  customerId?: string;
  customerName?: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;

  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      phone: users.phone,
      email: users.email,
      storeId: users.storeId,
    })
    .from(users)
    .where(eq(users.id, session.uid))
    .limit(1);

  const user = rows[0];
  if (!user) return null;

  let customerId: string | undefined;
  let customerName: string | undefined;
  if (user.role === 'customer') {
    const c = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.userId, user.id))
      .limit(1);
    if (c[0]) {
      customerId = c[0].id;
      customerName = c[0].name;
    }
  }

  return {
    id: user.id,
    role: user.role,
    phone: user.phone,
    email: user.email,
    storeId: user.storeId,
    customerId,
    customerName,
  };
}
