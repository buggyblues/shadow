import { StyleSheet, Text, View } from 'react-native'

/** QQ-style online rank: stars (<100h) → moons (100-500h) → suns (500h+) */
export function OnlineRank({ totalSeconds }: { totalSeconds: number }) {
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

  return (
    <View style={styles.container}>
      {Array.from({ length: suns }, (_, i) => (
        <Text key={`sun-${i}`} style={styles.icon}>
          ☀️
        </Text>
      ))}
      {Array.from({ length: moons }, (_, i) => (
        <Text key={`moon-${i}`} style={styles.icon}>
          🌙
        </Text>
      ))}
      {Array.from({ length: stars }, (_, i) => (
        <Text key={`star-${i}`} style={styles.icon}>
          ⭐
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  icon: {
    fontSize: 10,
  },
})
