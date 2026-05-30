const MARKETPLACE_CATEGORY_TAGS: Record<string, string[]> = {
  desktop_pet: ['虾豆桌面宠物'],
  desktop_pets: ['虾豆桌面宠物'],
  game_assets: ['游戏素材'],
  game_asset: ['游戏素材'],
  psych_tests: ['心理测试', '心里测试'],
  psychology_tests: ['心理测试', '心里测试'],
}

const MARKETPLACE_TAG_ALIASES: Record<string, string[]> = {
  心理测试: ['心理测试', '心里测试'],
  心里测试: ['心理测试', '心里测试'],
}

const PINNED_MARKETPLACE_TAGS = ['虾豆桌面宠物', '游戏素材', '心理测试']

export interface MarketplaceCategorySourceRow {
  productId: string
  tags: string[] | null
  salesCount: number
  ratingCount: number
  avgRating: number
  updatedAt: Date
}

export function marketplaceTagsFromQuery(category?: string | null, tag?: string | null) {
  const tags = new Set<string>()
  if (category) {
    for (const value of MARKETPLACE_CATEGORY_TAGS[category] ?? []) tags.add(value)
  }
  const normalizedTag = tag?.trim()
  if (normalizedTag) {
    const aliases = MARKETPLACE_TAG_ALIASES[normalizedTag] ?? [normalizedTag]
    for (const value of aliases) tags.add(value)
  }
  return [...tags]
}

export function recommendMarketplaceCategories(
  rows: MarketplaceCategorySourceRow[],
  limit = Number.MAX_SAFE_INTEGER,
  now = Date.now(),
) {
  const categoryMap = new Map<
    string,
    {
      tag: string
      productIds: Set<string>
      salesCount: number
      ratingCount: number
      avgRatingTotal: number
      recentBoost: number
    }
  >()

  for (const row of rows) {
    const tags = [...new Set((row.tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
    for (const tag of tags) {
      const existing = categoryMap.get(tag) ?? {
        tag,
        productIds: new Set<string>(),
        salesCount: 0,
        ratingCount: 0,
        avgRatingTotal: 0,
        recentBoost: 0,
      }
      if (!existing.productIds.has(row.productId)) {
        existing.productIds.add(row.productId)
        existing.salesCount += row.salesCount
        existing.ratingCount += row.ratingCount
        existing.avgRatingTotal += row.avgRating
        const ageDays = Math.max(0, (now - row.updatedAt.getTime()) / 86_400_000)
        existing.recentBoost += Math.max(0, 30 - ageDays) / 30
      }
      categoryMap.set(tag, existing)
    }
  }

  const rankedCategories = [...categoryMap.values()]
    .map((category) => {
      const productCount = category.productIds.size
      const avgRating = productCount ? Math.round(category.avgRatingTotal / productCount) : 0
      const score =
        productCount * 100 +
        category.salesCount * 8 +
        category.ratingCount * 4 +
        avgRating * 3 +
        Math.round(category.recentBoost * 10)
      return {
        tag: category.tag,
        title: category.tag,
        productCount,
        salesCount: category.salesCount,
        ratingCount: category.ratingCount,
        avgRating,
        score,
        href: `/app/shop/tags/${encodeURIComponent(category.tag)}`,
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.productCount - a.productCount ||
        b.salesCount - a.salesCount ||
        a.title.localeCompare(b.title),
    )

  const categoryByTag = new Map(rankedCategories.map((category) => [category.tag, category]))
  return [
    ...PINNED_MARKETPLACE_TAGS.map(
      (tag) =>
        categoryByTag.get(tag) ?? {
          tag,
          title: tag,
          productCount: 0,
          salesCount: 0,
          ratingCount: 0,
          avgRating: 0,
          score: 0,
          href: `/app/shop/tags/${encodeURIComponent(tag)}`,
        },
    ),
    ...rankedCategories.filter((category) => !PINNED_MARKETPLACE_TAGS.includes(category.tag)),
  ].slice(0, limit)
}
