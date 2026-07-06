import type React from 'react'

export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xl font-bold mb-3 text-gray-700 dark:text-gray-200 mt-8">{children}</h3>
  )
}
