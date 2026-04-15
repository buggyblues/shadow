import { CodeBlock } from '@/components/CodeBlock'

interface CliCommandSnippetProps {
  title: string
  command: string
}

export function CliCommandSnippet({ title, command }: CliCommandSnippetProps) {
  return (
    <div>
      <p className="mb-1 text-xs text-text-muted">{title}</p>
      <CodeBlock
        code={command}
        language="bash"
        showLineNumbers={false}
        maxHeight="120px"
        className="rounded-[18px]"
      />
    </div>
  )
}
