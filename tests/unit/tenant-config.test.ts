import "../helpers/test-env";
import { describe, expect, it } from "vitest";
import {
  TENANT_CONFIGS,
  TENANT_SLUGS,
  getTenantConfigByFolder,
  getTenantConfigBySlug,
  isValidTenantSlug,
} from "@/server/tenants/config";

describe("tenant config", () => {
  it("exposes exactly the three PRD tenants", () => {
    expect(TENANT_SLUGS).toEqual(["norteverde", "aurora", "vitalys"]);
  });

  it("maps folder variants back to the canonical slug", () => {
    expect(getTenantConfigByFolder("nortverde-logistica")?.slug).toBe("norteverde");
    expect(getTenantConfigByFolder("construtora-aurora")?.slug).toBe("aurora");
    expect(getTenantConfigByFolder("vitalys-saude")?.slug).toBe("vitalys");
    expect(getTenantConfigByFolder("aurora")?.slug).toBe("aurora");
    expect(getTenantConfigByFolder("VITALYS")?.slug).toBe("vitalys");
  });

  it("returns undefined for unknown folders", () => {
    expect(getTenantConfigByFolder("acme")).toBeUndefined();
    expect(getTenantConfigByFolder("")).toBeUndefined();
  });

  it("validates slugs strictly", () => {
    expect(isValidTenantSlug("norteverde")).toBe(true);
    expect(isValidTenantSlug("AURORA")).toBe(false);
    expect(isValidTenantSlug("")).toBe(false);
    expect(isValidTenantSlug(null)).toBe(false);
    expect(isValidTenantSlug(undefined)).toBe(false);
    expect(isValidTenantSlug(123)).toBe(false);
  });

  it("hydrates a full config from a known slug", () => {
    const cfg = getTenantConfigBySlug("vitalys");
    expect(cfg?.name).toContain("Vitalys");
    expect(cfg?.documentFolders.length).toBeGreaterThan(0);
  });

  for (const cfg of TENANT_CONFIGS) {
    it(`tenant ${cfg.slug} has non-empty name and at least one folder`, () => {
      expect(cfg.name.length).toBeGreaterThan(0);
      expect(cfg.documentFolders.length).toBeGreaterThan(0);
    });
  }
});
