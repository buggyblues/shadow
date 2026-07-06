import type React from 'react'

export function WarningCard({
  icon,
  title,
  desc,
}: {
  icon?: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
      {icon && <span className="text-xl shrink-0">{icon}</span>}
      <div>
        <p className="font-bold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="text-gray-600 dark:text-gray-300 text-sm">{desc}</p>
      </div>
    </div>
  )
}
