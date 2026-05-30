import { StyleSheet, View } from 'react-native'
import { spacing } from '../../theme'
import { AppScreen, AppText, Spinner } from '../ui'

interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <AppScreen>
      <View style={styles.container}>
        <Spinner size="large" />
        {message && (
          <AppText variant="body" tone="secondary" style={styles.text}>
            {message}
          </AppText>
        )}
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: spacing.md,
  },
})
