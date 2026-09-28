-- Safety net for existing data: if a format somehow has several active rows,
-- keep only the newest one active before the unique index is created.
UPDATE "PricingConfig" p
SET "isActive" = false
WHERE p."isActive" = true
  AND EXISTS (
    SELECT 1 FROM "PricingConfig" n
    WHERE n."format" = p."format"
      AND n."isActive" = true
      AND (n."createdAt", n."id") > (p."createdAt", p."id")
  );

-- At most one active pricing config per tutoring format (partial unique index).
CREATE UNIQUE INDEX "PricingConfig_one_active_per_format"
  ON "PricingConfig" ("format")
  WHERE "isActive" = true;
