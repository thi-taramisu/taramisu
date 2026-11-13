import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Links from the model open in a new tab and do not get access to this page.
const components: Components = {
  a: ({ node: _node, children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>
  ),
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} className="border-collapse text-xs" />
    </div>
  ),
}

/**
 * Renders an assistant answer as Markdown (GitHub flavour: lists, tables, code). The text comes from the model,
 * so raw HTML is not rendered and unsafe link targets are dropped (react-markdown defaults).
 */
export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 break-words [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-background/60 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_td]:border [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:border [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
