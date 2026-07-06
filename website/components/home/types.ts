export interface Play {
  id: string
  server?: string
  image?: string | null
  title: string
  titleEn?: string
  desc?: string | null
  descEn?: string | null
  accentColor: string
  memberCount?: number
}
