import type React from 'react'

export function Step({
  num,
  title,
  children,
}: {
  num: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4 my-6">
      <div className="shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold text-sm">
        {num}
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-2">{title}</h4>
        <div className="text-gray-600 dark:text-gray-300 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}
