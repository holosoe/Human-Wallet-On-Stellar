import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// This is required so we don't crash at build time if DATABASE_URL is not set
const sql = neon(process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost/placeholder');
export const db = drizzle(sql, { schema });
