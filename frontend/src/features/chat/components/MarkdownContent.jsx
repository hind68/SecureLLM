import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { normalizeAssistantMarkdown, normalizeMarkdownCodeFences } from '../utils/markdown'
import CodeBlock from './CodeBlock'

function MarkdownContent({ content, copiedKey, direction, onCopy, setCopiedKey }) {
  const normalizedContent = useMemo(
    () => normalizeAssistantMarkdown(normalizeMarkdownCodeFences(content)),
    [content],
  )

  const markdownComponents = useMemo(() => ({
    code({ children, className, ...props }) {
      return <code className={className} {...props}>{children}</code>
    },
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children
      const props = child?.props || {}
      const className = props.className || ''
      const match = /language-([^\s]+)/.exec(className)
      const code = String(props.children || '').replace(/\n$/, '')
      return (
        <CodeBlock
          code={code}
          copiedKey={copiedKey}
          language={match?.[1] || 'text'}
          onCopy={onCopy}
          setCopiedKey={setCopiedKey}
        />
      )
    },
  }), [copiedKey, onCopy, setCopiedKey])

  return (
    <div className="markdown-body" dir={direction}>
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownContent)
