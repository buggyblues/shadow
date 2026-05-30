import { describe, expect, it } from 'vitest'
import { marketplaceTagsFromQuery, recommendMarketplaceCategories } from './discover-marketplace'

describe('marketplaceTagsFromQuery', () => {
  it('maps legacy marketplace category aliases to product tags', () => {
    expect(marketplaceTagsFromQuery('desktop_pet', null)).toEqual(['虾豆桌面宠物'])
    expect(marketplaceTagsFromQuery('game_assets', null)).toEqual(['游戏素材'])
  })

  it('keeps psychology test typo aliases discoverable from direct tag pages', () => {
    expect(marketplaceTagsFromQuery(null, '心理测试')).toEqual(['心理测试', '心里测试'])
    expect(marketplaceTagsFromQuery(null, '心里测试')).toEqual(['心理测试', '心里测试'])
  })

  it('deduplicates category and tag inputs', () => {
    expect(marketplaceTagsFromQuery('psych_tests', '心里测试')).toEqual(['心理测试', '心里测试'])
  })
})

describe('recommendMarketplaceCategories', () => {
  it('aggregates public product tags and ranks them by marketplace activity', () => {
    const now = new Date('2026-05-30T00:00:00.000Z').getTime()
    const categories = recommendMarketplaceCategories(
      [
        {
          productId: 'product-a',
          tags: ['像素头像', '游戏 UI', '像素头像', ' '],
          salesCount: 2,
          ratingCount: 1,
          avgRating: 5,
          updatedAt: new Date(now - 86_400_000),
        },
        {
          productId: 'product-b',
          tags: ['像素头像', '音效'],
          salesCount: 1,
          ratingCount: 0,
          avgRating: 0,
          updatedAt: new Date(now - 40 * 86_400_000),
        },
        {
          productId: 'product-c',
          tags: ['剧情模板'],
          salesCount: 20,
          ratingCount: 10,
          avgRating: 4,
          updatedAt: new Date(now),
        },
      ],
      5,
      now,
    )

    expect(categories.map((category) => category.tag)).toEqual([
      '虾豆桌面宠物',
      '游戏素材',
      '心理测试',
      '剧情模板',
      '像素头像',
    ])
    expect(categories[4]).toMatchObject({
      tag: '像素头像',
      productCount: 2,
      salesCount: 3,
      ratingCount: 1,
    })
  })
})
