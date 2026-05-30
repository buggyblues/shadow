import { type LucideIcon, Moon, Star, Sun } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { iconSize, spacing, useColors } from '../../theme'

/** QQ-style online rank: stars (<100h) → moons (100-500h) → suns (500h+) */
export function OnlineRank({ totalSeconds }: { totalSeconds: number }) {
  const colors = useColors()
  const hours = totalSeconds / 3600
  let suns = 0
  let moons = 0
  let stars = 0

  if (hours >= 500) {
    suns = Math.min(Math.floor(hours / 500), 4)
    const remainAfterSuns = hours - suns * 500
    moons = Math.min(Math.floor(remainAfterSuns / 100), 3)
    const remainAfterMoons = remainAfterSuns - moons * 100
    stars = Math.min(Math.floor(remainAfterMoons / 16), 3)
  } else if (hours >= 100) {
    moons = Math.min(Math.floor(hours / 100), 3)
    const remain = hours - moons * 100
    stars = Math.min(Math.floor(remain / 16), 3)
  } else {
    stars = Math.min(Math.floor(hours / 16), 3)
  }

  if (suns === 0 && moons === 0 && stars === 0) {
    stars = hours >= 1 ? 1 : 0
  }

  if (suns === 0 && moons === 0 && stars === 0) return null

  const renderIcons = (count: number, prefix: 'sun' | 'moon' | 'star', Icon: LucideIcon) => {
    const items: ReactNode[] = []
    for (let n = count; n >= 1; n--) {
      items.push(
        <Icon
          key={`${prefix}-${n}`}
          size={iconSize.xs}
          color={colors.warning}
          fill={colors.warning}
        />,
      )
    }
    return items
  }

  return (
    <View style={styles.container}>
      {renderIcons(suns, 'sun', Sun)}
      {renderIcons(moons, 'moon', Moon)}
      {renderIcons(stars, 'star', Star)}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.px,
  },
})
