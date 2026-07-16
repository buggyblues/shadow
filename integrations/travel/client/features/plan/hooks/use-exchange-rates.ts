import { useQuery } from '@tanstack/react-query'
import { fetchExchangeRates } from '../api/providers.js'

export function useExchangeRates(base: string) {
  const normalizedBase = base.trim().toUpperCase()
  return useQuery({
    enabled: normalizedBase.length === 3,
    queryFn: async () => {
      const response = await fetchExchangeRates(normalizedBase)
      return response?.rates ?? {}
    },
    queryKey: ['travel', 'exchange-rates', normalizedBase],
    retry: false,
    staleTime: 6 * 60 * 60 * 1000,
  })
}
