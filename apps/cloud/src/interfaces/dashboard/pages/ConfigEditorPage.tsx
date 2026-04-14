import Editor, { type Monaco } from '@monaco-editor/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { FileJson, Layers, Save, Shield } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ValidateResult } from '@/lib/api'
import { useToast } from '@/stores/toast'

// ── Monaco JSON Schema setup (driven by API-served schema) ───────────────────

function setupMonacoJsonSchema(monaco: Monaco, schema: Record<string, unknown>) {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemaValidation: 'error',
    schemas: [
      {
        uri: 'https://raw.githubusercontent.com/BuggyBlues/shadow/main/apps/cloud/schemas/config.schema.json',
        fileMatch: ['*'],
        schema,
      },
    ],
  })
}

function CodeEditor({
  value,
  onChange,
  language = 'json',
}: {
  value: string
  onChange: (val: string) => void
  language?: string
}) {
  const editorRef = useRef<unknown>(null)

  const handleMount = async (editor: unknown, monaco: Monaco) => {
    editorRef.current = editor
    try {
      const schema = await api.schema()
      setupMonacoJsonSchema(monaco, schema)
    } catch {
      // Schema fetch failed — editor works without autocomplete
    }
  }

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden flex-1">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={(val) => onChange(val ?? '')}
        theme="vs-dark"
        onMount={handleMount}
        options={{
          minimap: { enabled: true, maxColumn: 80 },
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          formatOnPaste: true,
          automaticLayout: true,
          padding: { top: 8 },
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showProperties: true,
          },
          quickSuggestions: { other: true, strings: true },
          folding: true,
          foldingStrategy: 'indentation',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        }}
      />
    </div>
  )
}

export function ConfigEditorPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const [content, setContent] = useState('')
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [dirty, setDirty] = useState(false)

  // Fetch store templates for the selector
  const { data: storeTemplates } = useQuery({
    queryKey: ['templates', i18n.language],
    queryFn: () => api.templates.listByLocale(i18n.language),
  })

  // Fetch user's My Templates
  const { data: myTemplates } = useQuery({
    queryKey: ['my-templates'],
    queryFn: api.myTemplates.list,
  })

  // Load current config
  const { data, isLoading, error } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.config.get(),
    retry: false,
  })

  useEffect(() => {
    if (data?.content) {
      setContent(data.content)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (text: string) => api.config.put({ content: text }),
    onSuccess: () => {
      toast.success(t('configEditor.saved'))
      setDirty(false)
    },
    onError: () => toast.error(t('configEditor.saveFailed')),
  })

  const validateMutation = useMutation({
    mutationFn: (config: unknown) => api.validate(config),
    onSuccess: (data) => {
      setValidateResult(data)
      if (data.valid) {
        toast.success(
          t('templateDetail.validationSummaryValid', {
            agents: data.agents,
            configurations: data.configurations,
          }),
        )
      } else {
        toast.error(
          t('configEditor.validationSummaryInvalid', {
            violations: data.violations.length,
            extendsErrors: data.extendsErrors.length,
          }),
        )
      }
    },
  })

  const handleSave = () => saveMutation.mutate(content)

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(content)
      setValidateResult(null)
      validateMutation.mutate(parsed)
    } catch {
      toast.error(t('templateDetail.invalidJSONSyntax'))
    }
  }

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(content)
      setContent(JSON.stringify(parsed, null, 2))
      toast.info(t('templateDetail.formatted'))
    } catch {
      toast.error(t('templateDetail.cannotFormat'))
    }
  }

  const handleLoadTemplate = async (templateName: string) => {
    if (!templateName) return
    try {
      const tplData = await api.templates.get(templateName)
      setContent(JSON.stringify(tplData, null, 2))
      setSelectedTemplate(templateName)
      setDirty(false)
      toast.info(t('configEditor.loadedTemplate', { name: templateName }))
    } catch {
      toast.error(t('configEditor.loadTemplateFailed'))
    }
  }

  const handleLoadMyTemplate = async (name: string) => {
    if (!name) return
    try {
      const tplData = await api.myTemplates.get(name)
      setContent(JSON.stringify(tplData.content, null, 2))
      setSelectedTemplate(`my:${name}`)
      setDirty(false)
      toast.info(t('configEditor.loadedTemplate', { name }))
    } catch {
      toast.error(t('configEditor.loadTemplateFailed'))
    }
  }

  const handleSaveToMyTemplates = async () => {
    try {
      const parsed = JSON.parse(content)
      const name = selectedTemplate.startsWith('my:')
        ? selectedTemplate.slice(3)
        : `my-${selectedTemplate || 'config'}-${Date.now()}`
      await api.myTemplates.save(
        name,
        parsed,
        selectedTemplate.startsWith('my:') ? undefined : selectedTemplate || undefined,
      )
      queryClient.invalidateQueries({ queryKey: ['my-templates'] })
      setDirty(false)
      toast.success(t('configEditor.savedAsTemplate', { name }))
    } catch {
      toast.error(t('templateDetail.invalidJSONCannotSave'))
    }
  }

  const handleContentChange = (val: string) => {
    setContent(val)
    setValidateResult(null)
    setDirty(true)
  }

  const isValidJson = (() => {
    try {
      JSON.parse(content)
      return true
    } catch {
      return false
    }
  })()

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {t('configEditor.title')}
            {dirty && (
              <span className="text-xs text-yellow-400 font-normal">
                ({t('configEditor.unsaved')})
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedTemplate ? (
              <span>
                {t('configEditor.editing')}{' '}
                <code className="font-mono text-xs text-gray-400">
                  {selectedTemplate.startsWith('my:')
                    ? selectedTemplate.slice(3)
                    : selectedTemplate}
                </code>
              </span>
            ) : data?.path ? (
              <span className="font-mono text-xs">{data.path}</span>
            ) : (
              t('configEditor.selectTemplateOrScratch')
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Template selector */}
          <select
            value=""
            onChange={(e) => {
              const val = e.target.value
              if (val.startsWith('store:')) handleLoadTemplate(val.slice(6))
              else if (val.startsWith('my:')) handleLoadMyTemplate(val.slice(3))
            }}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500 max-w-[180px]"
          >
            <option value="">{t('validate.loadTemplate')}...</option>
            {(storeTemplates ?? []).length > 0 && (
              <optgroup label={t('configEditor.storeTemplates')}>
                {storeTemplates?.map((t) => (
                  <option key={`store:${t.name}`} value={`store:${t.name}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {(myTemplates ?? []).length > 0 && (
              <optgroup label={t('configEditor.myTemplates')}>
                {myTemplates?.map((t) => (
                  <option key={`my:${t.name}`} value={`my:${t.name}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={handleFormat}
            disabled={!isValidJson}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            <FileJson size={12} />
            {t('templateDetail.format')}
          </button>
          <button
            type="button"
            onClick={handleValidate}
            disabled={!isValidJson || validateMutation.isPending}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            <Shield size={12} />
            {t('templateDetail.validate')}
          </button>
          <button
            type="button"
            onClick={handleSaveToMyTemplates}
            disabled={!isValidJson || !content.trim()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
            title={t('configEditor.saveToMyTemplates')}
          >
            <Layers size={12} />
            {t('configEditor.saveAsTemplate')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!content.trim() || saveMutation.isPending}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors',
              saveMutation.isPending
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white',
            )}
          >
            <Save size={12} />
            {t('common.save')}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-gray-500 text-sm py-8">
          {t('configEditor.loadingConfig')}
        </div>
      )}

      {error && !data && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-yellow-400">{t('configEditor.noConfigLoaded')}</p>
        </div>
      )}

      {/* Validation result banner */}
      {validateResult && (
        <div
          className={clsx(
            'border rounded-lg p-3 mb-4 flex items-center gap-2',
            validateResult.valid
              ? 'bg-green-900/20 border-green-800 text-green-400'
              : 'bg-red-900/20 border-red-800 text-red-400',
          )}
        >
          <Shield size={14} />
          <span className="text-sm">
            {validateResult.valid
              ? t('templateDetail.validationSummaryValid', {
                  agents: validateResult.agents,
                  configurations: validateResult.configurations,
                })
              : t('configEditor.validationSummaryInvalid', {
                  violations: validateResult.violations.length,
                  extendsErrors: validateResult.extendsErrors.length,
                })}
          </span>
        </div>
      )}

      {validateMutation.error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4 text-red-400 text-sm">
          {validateMutation.error.message}
        </div>
      )}

      {/* Editor with JSON Schema autocomplete */}
      <CodeEditor value={content} onChange={handleContentChange} language="json" />

      {/* Status bar */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
        <div className="flex items-center gap-3">
          <span>
            {content.split('\n').length} {t('templateDetail.lines')}
          </span>
          <span>
            {content.length} {t('configEditor.chars')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {content.trim() && (
            <span className={isValidJson ? 'text-green-600' : 'text-red-500'}>
              {isValidJson ? t('templateDetail.validJSON') : t('templateDetail.invalidJSON')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
