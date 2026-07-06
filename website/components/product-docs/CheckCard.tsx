import { CheckIcon } from '../icons/Icons'

export function CheckCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex items-start gap-3">
      <CheckIcon className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-gray-800 dark:text-gray-100">{title}</p>
        <p className="text-gray-600 dark:text-gray-300 text-sm">{desc}</p>
      </div>
    </div>
  )
}
