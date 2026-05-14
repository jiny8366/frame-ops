import { relations } from 'drizzle-orm';
import { customerPrescriptions, customers } from './customers';
import { inventory, inventoryMovements } from './inventory';
import { lenses, lensBarcodes, lensVariants } from './lenses';
import { notifications } from './notifications';
import { orders, orderItems, orderStatusHistory } from './orders';
import { payments } from './payments';
import { stores } from './stores';
import { users } from './users';

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  customer: one(customers, {
    fields: [users.id],
    references: [customers.userId],
  }),
  notifications: many(notifications),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(users, {
    fields: [customers.userId],
    references: [users.id],
  }),
  referrer: one(customers, {
    fields: [customers.referredById],
    references: [customers.id],
    relationName: 'customer_referrer',
  }),
  referrals: many(customers, { relationName: 'customer_referrer' }),
  prescriptions: many(customerPrescriptions),
  orders: many(orders),
}));

export const customerPrescriptionsRelations = relations(
  customerPrescriptions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerPrescriptions.customerId],
      references: [customers.id],
    }),
  }),
);

export const storesRelations = relations(stores, ({ many }) => ({
  staff: many(users),
  orders: many(orders),
  payments: many(payments),
}));

export const lensesRelations = relations(lenses, ({ many }) => ({
  variants: many(lensVariants),
}));

export const lensVariantsRelations = relations(
  lensVariants,
  ({ one, many }) => ({
    lens: one(lenses, {
      fields: [lensVariants.lensId],
      references: [lenses.id],
    }),
    barcodes: many(lensBarcodes),
    inventory: one(inventory, {
      fields: [lensVariants.id],
      references: [inventory.variantId],
    }),
    movements: many(inventoryMovements),
    orderItems: many(orderItems),
  }),
);

export const lensBarcodesRelations = relations(lensBarcodes, ({ one }) => ({
  variant: one(lensVariants, {
    fields: [lensBarcodes.variantId],
    references: [lensVariants.id],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  variant: one(lensVariants, {
    fields: [inventory.variantId],
    references: [lensVariants.id],
  }),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    variant: one(lensVariants, {
      fields: [inventoryMovements.variantId],
      references: [lensVariants.id],
    }),
    performer: one(users, {
      fields: [inventoryMovements.performedBy],
      references: [users.id],
    }),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  pickupStore: one(stores, {
    fields: [orders.pickupStoreId],
    references: [stores.id],
  }),
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(lensVariants, {
    fields: [orderItems.variantId],
    references: [lensVariants.id],
  }),
}));

export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderStatusHistory.orderId],
      references: [orders.id],
    }),
    changedByUser: one(users, {
      fields: [orderStatusHistory.changedBy],
      references: [users.id],
    }),
  }),
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  store: one(stores, {
    fields: [payments.storeId],
    references: [stores.id],
  }),
  collector: one(users, {
    fields: [payments.collectedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
}));
