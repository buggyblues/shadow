import type React from 'react'

export function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon?: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex items-start gap-3">
      {icon && <span className="text-2xl shrink-0">{icon}</span>}
      <div>
        <p className="font-bold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="text-gray-600 dark:text-gray-300 text-sm">{desc}</p>
      </div>
    </div>
  )
}
