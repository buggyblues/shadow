import { useEffect, useState } from 'react'
import { fetchPublicServerPlays } from '../api/publicServers'
import type { Play } from '../components/home/types'

export type HomeData = {
  dicePlays: Play[]
  isLoading: boolean
}

let cachedDicePlays: Play[] = []
let hasLoadedHomeData = false
let loadHomeDataPromise: Promise<Play[]> | null = null

async function loadHomeData() {
  if (!loadHomeDataPromise) {
    loadHomeDataPromise = fetchPublicServerPlays()
      .then((dicePlays) => {
        cachedDicePlays = dicePlays
        hasLoadedHomeData = true
        return cachedDicePlays
      })
      .catch(() => {
        hasLoadedHomeData = true
        return cachedDicePlays
      })
  }

  return loadHomeDataPromise
}

export function useHomeData() {
  const [data, setData] = useState<HomeData>({
    dicePlays: cachedDicePlays,
    isLoading: !hasLoadedHomeData,
  })

  useEffect(() => {
    let cancelled = false
    void loadHomeData().then((dicePlays) => {
      if (!cancelled) setData({ dicePlays, isLoading: false })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return data
}
