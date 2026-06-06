import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReactSelect } from './react-select.js'

describe('ReactSelect', () => {
  it('renders a React combobox/listbox instead of a native select', () => {
    const html = renderToStaticMarkup(
      <ReactSelect
        defaultOpen
        onChange={() => {}}
        options={[
          { label: 'Coordinator', value: 'coordinator' },
          { label: 'ReviewMiner', value: 'reviewminer' },
        ]}
        placeholder="Select Buddy"
        value="reviewminer"
      />,
    )

    expect(html).toContain('role="combobox"')
    expect(html).toContain('role="listbox"')
    expect(html).toContain('role="option"')
    expect(html).toContain('ReviewMiner')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('<option')
  })

  it('supports custom value and option renderers', () => {
    const html = renderToStaticMarkup(
      <ReactSelect
        defaultOpen
        onChange={() => {}}
        options={[{ label: 'BrandScout', value: 'brandscout' }]}
        placeholder="Select Buddy"
        renderOption={(option) => <span data-role="custom-option">{option.label}</span>}
        renderValue={(option) => <span data-role="custom-value">{option.label}</span>}
        value="brandscout"
      />,
    )

    expect(html).toContain('data-role="custom-value"')
    expect(html).toContain('data-role="custom-option"')
  })

  it('renders an empty menu state without falling back to native options', () => {
    const html = renderToStaticMarkup(
      <ReactSelect
        defaultOpen
        emptyLabel="No Buddies available"
        onChange={() => {}}
        options={[]}
        placeholder="Select Buddy"
        value=""
      />,
    )

    expect(html).toContain('No Buddies available')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('<option')
  })
})
