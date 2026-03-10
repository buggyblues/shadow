import type { Logger } from 'pino'

/** MinIO / S3 compatible storage service */
export class MediaService {
  // MinIO client will be initialized when service starts
  minioClient: import('minio').Client | null = null

  constructor(private deps: { logger: Logger }) {}

  async init() {
    try {
      const { Client } = await import('minio')
      this.minioClient = new Client({
        endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
        port: Number(process.env.MINIO_PORT ?? 9000),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      })

      // Ensure bucket exists
      const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
      const exists = await this.minioClient.bucketExists(bucketName)
      if (!exists) {
        await this.minioClient.makeBucket(bucketName)
      }

      // Set public read policy so uploaded files are directly accessible
      const publicPolicy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      })
      await this.minioClient.setBucketPolicy(bucketName, publicPolicy)

      this.deps.logger.info('MinIO storage initialized')
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'MinIO not available, file upload disabled')
    }
  }

  async upload(
    file: Buffer,
    filename: string,
    contentType: string,
  ): Promise<{ url: string; size: number }> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }

    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const key = `uploads/${Date.now()}-${filename}`

    await this.minioClient.putObject(bucketName, key, file, file.length, {
      'Content-Type': contentType,
    })

    const url = `/${bucketName}/${key}`
    return { url, size: file.length }
  }

  async getPresignedUrl(key: string): Promise<string> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }

    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    return this.minioClient.presignedGetObject(bucketName, key, 3600)
  }

  /** Retrieve file content from MinIO by its contentRef (e.g. /shadow/uploads/...) */
  async getFileBuffer(contentRef: string): Promise<Buffer | null> {
    if (!this.minioClient) return null
    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const prefix = `/${bucketName}/`
    if (!contentRef.startsWith(prefix)) return null
    const key = contentRef.slice(prefix.length)

    try {
      const stream = await this.minioClient.getObject(bucketName, key)
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
      }
      return Buffer.concat(chunks)
    } catch {
      return null
    }
  }
}
