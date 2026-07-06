import type React from 'react'
import { LightbulbIcon } from '../icons/Icons'

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 rounded-xl p-4 my-4 text-sm text-cyan-800 dark:text-cyan-200 flex gap-2">
      <LightbulbIcon className="w-5 h-5 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  )
}
