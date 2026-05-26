import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpaceVisibility } from '../types.js'
import {
  getArtwork,
  getOAuthSession,
  getProfile,
  listArtworks,
  listFavorites,
  listTags,
} from './api.js'

export function useProfile() {
  return useQuery({ queryKey: ['space', 'profile'], queryFn: getProfile })
}

export function useOAuthSession() {
  return useQuery({
    queryKey: ['space', 'oauth-session'],
    queryFn: getOAuthSession,
    staleTime: 30_000,
  })
}

export function useArtworks(
  input: {
    query?: string
    tag?: string
    visibility?: SpaceVisibility | 'all'
    limit?: number
  } = {},
) {
  return useQuery({
    queryKey: ['space', 'artworks', input],
    queryFn: () => listArtworks(input),
  })
}

export function useArtwork(artworkId: string | undefined) {
  return useQuery({
    queryKey: ['space', 'artwork', artworkId],
    queryFn: () => getArtwork(artworkId ?? ''),
    enabled: !!artworkId,
  })
}

export function useTags() {
  return useQuery({ queryKey: ['space', 'tags'], queryFn: listTags })
}

export function useFavorites() {
  return useQuery({ queryKey: ['space', 'favorites'], queryFn: listFavorites })
}

export function useInvalidateSpace() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['space'] })
}
