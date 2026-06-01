ALTER TABLE "documents" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "documents_tenant_status_idx" ON "documents" USING btree ("tenant_id","status");