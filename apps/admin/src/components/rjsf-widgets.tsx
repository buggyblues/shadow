'use client'
import type { ArrayFieldItemTemplateProps, ArrayFieldTemplateProps, BaseInputTemplateProps, FieldTemplateProps, ObjectFieldTemplateProps, RegistryWidgetsType, WidgetProps } from '@rjsf/utils'
import MDEditor from '@uiw/react-md-editor'
import { Minus, Plus, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

// ── Image Upload Widget ──────────────────────────────────────────────────────
export function ImageUploadWidget({ value, onChange, disabled }: WidgetProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const token = localStorage.getItem('admin_token') ?? ''
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = (await res.json()) as { url: string }
      onChange(data.url)
    } catch (e) {
      console.error(e)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value && (
        <img src={value as string} alt="preview" className="h-32 w-auto rounded object-cover" />
      )}
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
        {value && (
          <input
            type="text"
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            placeholder="or paste URL"
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        )}
      </div>
      {!value && (
        <input
          type="text"
          onChange={(e) => onChange(e.target.value)}
          placeholder="or paste image URL"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      )}
    </div>
  )
}

// ── Rich Text / Markdown Widget ──────────────────────────────────────────────
export function RichTextWidget({ value, onChange, disabled }: WidgetProps) {
  return (
    <div data-color-mode="light">
      <MDEditor
        value={(value as string) ?? ''}
        onChange={(val) => onChange(val ?? '')}
        height={240}
        preview="edit"
        textareaProps={{ disabled }}
      />
    </div>
  )
}

// ── Map / Record Widget ──────────────────────────────────────────────────────
export function MapWidget({ value, onChange, disabled }: WidgetProps) {
  const entries: [string, string][] = Object.entries(
    (value as Record<string, string> | undefined) ?? {},
  )

  const update = (newEntries: [string, string][]) => {
    const obj: Record<string, string> = {}
    for (const [k, v] of newEntries) {
      if (k) obj[k] = v
    }
    onChange(obj)
  }

  const addRow = () => update([...entries, ['', '']])
  const removeRow = (idx: number) => update(entries.filter((_, i) => i !== idx))
  const updateKey = (idx: number, key: string) => {
    const copy = [...entries] as [string, string][]
    copy[idx] = [key, copy[idx]?.[1] ?? '']
    update(copy)
  }
  const updateVal = (idx: number, val: string) => {
    const copy = [...entries] as [string, string][]
    copy[idx] = [copy[idx]?.[0] ?? '', val]
    update(copy)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([k, v], idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={k}
            onChange={(e) => updateKey(idx, e.target.value)}
            placeholder="key"
            disabled={disabled}
            className="w-36 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <span className="text-gray-400">:</span>
          <input
            type="text"
            value={v}
            onChange={(e) => updateVal(idx, e.target.value)}
            placeholder="value"
            disabled={disabled}
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            disabled={disabled}
            className="rounded p-1 text-red-400 hover:bg-red-50"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="flex w-fit items-center gap-1.5 rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:bg-gray-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add entry
      </button>
    </div>
  )
}

// ── Array Field Item Template ───────────────────────────────────────────────
export function ArrayItemTemplate({ children, buttonsProps, hasToolbar, index }: ArrayFieldItemTemplateProps) {
  const { hasMoveUp, hasMoveDown, hasRemove, hasCopy, onMoveUpItem, onMoveDownItem, onRemoveItem, onCopyItem, disabled } = buttonsProps
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <span className="text-gray-500 transition-transform" style={{ display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
          #{index + 1}
        </button>
        {hasToolbar && (
          <div className="flex gap-1">
            {hasMoveUp && (
              <button type="button" onClick={(e) => { e.preventDefault(); onMoveUpItem(e) }} disabled={disabled}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                title="Move up">
                ↑
              </button>
            )}
            {hasMoveDown && (
              <button type="button" onClick={(e) => { e.preventDefault(); onMoveDownItem(e) }} disabled={disabled}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                title="Move down">
                ↓
              </button>
            )}
            {hasCopy && (
              <button type="button" onClick={(e) => { e.preventDefault(); onCopyItem(e) }} disabled={disabled}
                className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                title="Duplicate">
                Dup
              </button>
            )}
            {hasRemove && (
              <button type="button" onClick={(e) => { e.preventDefault(); onRemoveItem(e) }} disabled={disabled}
                className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                title="Remove">
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      {!collapsed && <div className="mt-2 w-full">{children}</div>}
    </div>
  )
}

// ── Array Field Template ─────────────────────────────────────────────────────
export function SortableArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { title, items, canAdd, onAddClick } = props

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      )}
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={item.key ?? i} className="w-full rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            {item}
          </div>
        ))}
      </div>
      {canAdd && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex w-fit items-center gap-1.5 rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add item
        </button>
      )}
    </div>
  )
}

export const customWidgets: RegistryWidgetsType = {
  ImageUploadWidget,
  RichTextWidget,
  MapWidget,
}

// ── RJSF Base Input Template ─────────────────────────────────────────────────
export function BaseInputTemplate({
  id, value, onChange, type, required, disabled, readonly, autofocus, placeholder, options,
}: BaseInputTemplateProps) {
  const inputType = type === 'integer' ? 'number' : (type || 'text')
  return (
    <input
      id={id}
      type={inputType}
      value={value ?? ''}
      required={required}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      onChange={({ target: { value: v } }) => onChange(v === '' ? options.emptyValue : v)}
    />
  )
}

// ── RJSF Field Template ──────────────────────────────────────────────────────
export function RjsfFieldTemplate({
  id, label, help, required, description, errors, children, hidden,
}: FieldTemplateProps) {
  if (hidden) return <>{children}</>
  if (id === 'root') return <div className="flex flex-col gap-5">{children}</div>
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {description && <div className="mt-0 text-xs text-gray-500">{description}</div>}
      {children}
      {errors && <div className="text-xs text-red-500">{errors}</div>}
      {help && <div className="text-xs text-gray-500">{help}</div>}
    </div>
  )
}

// ── RJSF Object Field Template ───────────────────────────────────────────────
export function RjsfObjectFieldTemplate({
  title, description, properties, fieldPathId,
}: ObjectFieldTemplateProps) {
  const isRoot = !fieldPathId?.$id || fieldPathId.$id === 'root'
  const useGrid = !isRoot && properties.length >= 4
  return (
    <div className={isRoot ? 'flex w-full flex-col gap-5' : 'flex w-full flex-col gap-3'}>
      {!isRoot && title && <h4 className="text-sm font-semibold text-gray-800">{title}</h4>}
      {!isRoot && description && <p className="text-xs text-gray-500">{description}</p>}
      <div className={useGrid ? 'grid grid-cols-2 gap-x-4 gap-y-3' : 'flex flex-col gap-3'}>
        {properties.map((prop) => prop.content)}
      </div>
    </div>
  )
}
