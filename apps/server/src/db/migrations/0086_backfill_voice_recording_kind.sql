UPDATE "attachments"
SET "kind" = 'voice'
WHERE "kind" = 'file'
  AND "content_type" LIKE 'audio/%'
  AND (
    "duration_ms" IS NOT NULL
    OR "waveform_peaks" IS NOT NULL
    OR "filename" LIKE 'voice-%'
    OR "filename" LIKE 'voice_%'
  );
