import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const beneficiaries = pgTable('beneficiaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  ethAddress: text('eth_address').notNull().unique(),
  stellarAddress: text('stellar_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const disbursements = pgTable('disbursements', {
  id: uuid('id').defaultRandom().primaryKey(),
  beneficiaryId: uuid('beneficiary_id').references(() => beneficiaries.id).notNull(),
  amount: text('amount').notNull(),
  txHash: text('tx_hash').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
