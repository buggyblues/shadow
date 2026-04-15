/**
 * Remark plugin: transforms VitePress-style :::code-group containers
 * into <CodeGroup> JSX elements for Rspress.
 */

interface MdastNode {
  type: string
  children?: MdastNode[]
  value?: string
  lang?: string
  meta?: string
}

export default function remarkCodeGroup() {
  return (tree: MdastNode) => {
    const children = tree.children!
    let i = 0

    while (i < children.length) {
      const node = children[i]

      if (isCodeGroupOpen(node)) {
        let j = i + 1
        const items: { label: string; codeNode: MdastNode }[] = []

        while (j < children.length && !isCodeGroupClose(children[j])) {
          if (children[j].type === 'code') {
            const meta = children[j].meta || ''
            const label = meta.match(/\[(.*?)\]/)?.[1] || children[j].lang || 'Code'
            items.push({ label, codeNode: children[j] })
          }
          j++
        }

        if (items.length > 0) {
          const groupNode = {
            type: 'mdxJsxFlowElement',
            name: 'CodeGroup',
            attributes: [] as unknown[],
            children: items.map((item) => ({
              type: 'mdxJsxFlowElement',
              name: 'div',
              attributes: [{ type: 'mdxJsxAttribute', name: 'data-title', value: item.label }],
              children: [item.codeNode],
            })),
          }

          const endIdx = j < children.length ? j + 1 : j
          children.splice(i, endIdx - i, groupNode as unknown as MdastNode)
        }
      }
      i++
    }
  }
}

function isCodeGroupOpen(node: {
  type: string
  children?: Array<{ type: string; value?: string }>
}) {
  if (node.type !== 'paragraph') return false
  const text = node.children?.[0]
  return text?.type === 'text' && text.value?.trim() === ':::code-group'
}

function isCodeGroupClose(node: {
  type: string
  children?: Array<{ type: string; value?: string }>
}) {
  if (node.type !== 'paragraph') return false
  const text = node.children?.[0]
  return text?.type === 'text' && text.value?.trim() === ':::'
}
