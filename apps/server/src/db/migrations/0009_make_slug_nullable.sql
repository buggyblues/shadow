-- Make slug nullable: servers without an explicit slug will use UUID in URLs
ALTER TABLE "servers" ALTER COLUMN "slug" DROP NOT NULL;
