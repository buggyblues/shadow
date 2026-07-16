UPDATE "cloud_deployments"
SET
	"error_message" = 'cloud computer runtime removed; safe rebuild required',
	"updated_at" = now()
WHERE "error_message" = 'runtime removed by legacy Cloud Computer billing policy; safe rebuild required';
