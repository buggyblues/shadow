import { useState } from 'react'
import type { ConfigSchema } from '../lib/config-api'
import { ConfigEditorPage } from './config-editor'
import { SchemaManagerPage } from './config-schema-manager'
import { FeatureFlagsPage } from './feature-flags'

type Section = 'schemas' | 'editor' | 'flags'

export function ConfigManagementPage() {
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

  const tabs: { id: Section; label: string }[] = [
    { id: 'schemas', label: 'Schemas' },
    { id: 'flags', label: 'Feature Flags' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Config Platform</h2>
        {section === 'editor' && (
          <button
            onClick={handleBackToSchemas}
            className="text-sm text-zinc-400 hover:text-white transition flex items-center gap-1"
          >
            ← 返回 Schemas
          </button>
        )}
      </div>

      {section !== 'editor' && (
        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSection(t.id)
                setEditingSchema(null)
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                section === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {section === 'schemas' && <SchemaManagerPage onSelectSchema={handleSelectSchema} />}
      {section === 'editor' && editingSchema && (
        <ConfigEditorPage schema={editingSchema} onBack={handleBackToSchemas} />
      )}
      {section === 'flags' && <FeatureFlagsPage />}
    </div>
  )
}
