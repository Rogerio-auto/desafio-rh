import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tenants, type Tenant } from "@/server/db/schema";
import { getTenantConfigBySlug, isValidTenantSlug } from "./config";

/**
 * Resolve a tenant by its public slug. The slug is validated against the
 * static tenant registry first to fail fast and to make sure callers cannot
 * pass arbitrary strings through to a SQL filter.
 *
 * Throws `TenantNotFoundError` when the slug is unknown OR when the slug is
 * known but the corresponding row was never seeded. Returning `undefined`
 * would let callers silently skip the tenant filter — and an unfiltered
 * vector search across tenants is a critical security failure.
 */
export class TenantNotFoundError extends Error {
  constructor(slug: string) {
    super(`Tenant not found: ${slug}`);
    this.name = "TenantNotFoundError";
  }
}

export async function resolveTenant(slug: unknown): Promise<Tenant> {
  if (!isValidTenantSlug(slug)) {
    throw new TenantNotFoundError(String(slug));
  }
  const row = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const tenant = row[0];
  if (!tenant) {
    throw new TenantNotFoundError(slug);
  }
  return tenant;
}

export async function getOrCreateTenant(slug: string): Promise<Tenant> {
  const config = getTenantConfigBySlug(slug);
  if (!config) {
    throw new TenantNotFoundError(slug);
  }
  const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(tenants)
    .values({ slug: config.slug, name: config.name })
    .returning();
  const tenant = inserted[0];
  if (!tenant) {
    throw new Error(`Failed to insert tenant ${slug}`);
  }
  return tenant;
}

export async function listTenants(): Promise<Tenant[]> {
  return db.select().from(tenants);
}
