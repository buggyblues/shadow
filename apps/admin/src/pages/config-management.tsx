import { useState } from 'react'
import { FileCode, Flag, LayoutDashboard, Settings } from 'lucide-react'
import { ConfigEditorPage } from './config-editor'
import { FeatureFlagsPage } from './feature-flags'
import { SchemaManagerPage } from './config-schema-manager'
import type { ConfigSchema } from '../lib/config-api'

type Section = 'schemas' | 'editor' | 'flags'

export function ConfigManagementPage() {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-3">Please log in from the main admin panel first.</p>
          <a href="/" className="text-indigo-600 hover:underline">← Back to admin</a>
        </div>
      </div>
    )
  }

  const [section, setSection] = useState<Section>('schemas')
  const [editingSchema, setEditingSchema] = useState<ConfigSchema | null>(null)

  const handleSelectSchema = (schema: ConfigSchema) => {
    setEditingSchema(schema)
    setSection('editor')
  }

  const handleBackToSchemas = () => {
    setEditingSchema(null)
    setSection('schemas')
  }

  const navItems = [
    { id: 'schemas' as Section, label: 'Schemas', icon: FileCode },
    { id: 'flags' as Section, label: 'Feature Flags', icon: Flag },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <a href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-3">
            <LayoutDashboard className="h-3.5 w-3.5" /> Admin home
          </a>
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <Settings className="h-4 w-4 text-indigo-600" /> Config Platform
          </h2>
        </div>
        <nav className="flex flex-col gap-0.5 p-2 flex-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setSection(id)
                if (id === 'schemas') setEditingSchema(null)
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors text-left ${(section === id || (section === 'editor' && id === 'schemas'))
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6 flex flex-col min-h-screen">
        {section === 'schemas' && (
          <SchemaManagerPage onSelectSchema={handleSelectSchema} />
        )}
        {section === 'editor' && editingSchema && (
          <ConfigEditorPage schema={editingSchema} onBack={handleBackToSchemas} />
        )}
        {section === 'flags' && <FeatureFlagsPage />}
      </main>
    </div>
  )
}
