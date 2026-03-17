interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
