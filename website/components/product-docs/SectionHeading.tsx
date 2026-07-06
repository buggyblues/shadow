import type React from 'react'

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="zcool text-2xl md:text-3xl mb-4 text-gray-800 dark:text-gray-100 border-b-2 border-cyan-200 dark:border-cyan-800 pb-2">
      {children}
    </h2>
  )
}
