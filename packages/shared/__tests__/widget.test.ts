import { describe, expect, it } from 'vitest'
import {
  defaultShadowWidgetOptions,
  localizeShadowWidgetDefinition,
  resolveShadowWidgetValue,
  type ShadowWidgetDefinition,
} from '../src/widget'

const definition: ShadowWidgetDefinition = {
  key: 'rate',
  title: 'Rate',
  category: 'finance',
  size: { default: { widthCells: 4, heightCells: 3 } },
  options: [
    {
      key: 'base',
      type: 'select',
      label: 'Base',
      defaultValue: 'USD',
      choices: [
        { value: 'USD', label: 'USD' },
        { value: 'EUR', label: 'EUR' },
      ],
    },
  ],
  strings: { latest: 'Latest' },
  i18n: {
    'zh-CN': {
      $title: '汇率',
      '$option.base': '基础货币',
      latest: '最新',
    },
  },
  data: { command: 'rates.read' },
  view: { type: 'text', value: { path: 'rate.value' } },
}

describe('widget contract', () => {
  it('localizes metadata and returns declared defaults', () => {
    const localized = localizeShadowWidgetDefinition(definition, 'zh-CN')
    expect(localized.title).toBe('汇率')
    expect(localized.category).toBe('finance')
    expect(localized.options?.[0]?.label).toBe('基础货币')
    expect(localized.strings?.latest).toBe('最新')
    expect(defaultShadowWidgetOptions(localized)).toEqual({ base: 'USD' })
  })

  it('resolves only literal, string, and object-path values', () => {
    const data = { rate: { value: 7.2 } }
    expect(resolveShadowWidgetValue({ path: '$.rate.value' }, data)).toBe('7.2')
    expect(resolveShadowWidgetValue({ path: 'rate.missing' }, data)).toBe('')
    expect(resolveShadowWidgetValue({ stringKey: 'latest' }, data, { latest: 'Latest' })).toBe(
      'Latest',
    )
    expect(resolveShadowWidgetValue({ literal: '<script>unsafe()</script>' }, data)).toBe(
      '<script>unsafe()</script>',
    )
  })
})
