import { safeMarkdownHref } from '@nowoll/validation'
import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../cn.js'

// ============================================================================
// Markdown → page text (step 36 part 2). ONE renderer for the shop's pages AND
// the admin's live preview, so the preview looks exactly like the shop.
// Safety (CLAUDE.md Rule 9 — no pasted HTML/JavaScript):
//   • raw HTML in the text is skipped, never run (skipHtml)
//   • links: only /shop paths, https, mailto: and tel: survive (the words of
//     any other link stay, the link itself is dropped)
//   • no pictures inside pages (only a picture's description is shown)
// Styling: Tailwind classes per element (the project has no typography plugin).
// ============================================================================

const isExternal = (href: string) => /^https:\/\//i.test(href)

const components: Components = {
  h1: (p) => <h2 className="mt-8 mb-3 text-2xl font-semibold first:mt-0" {...strip(p)} />,
  h2: (p) => <h2 className="mt-8 mb-3 text-xl font-semibold first:mt-0" {...strip(p)} />,
  h3: (p) => <h3 className="mt-6 mb-2 text-lg font-semibold first:mt-0" {...strip(p)} />,
  h4: (p) => <h4 className="mt-4 mb-2 font-semibold" {...strip(p)} />,
  p: (p) => <p className="my-3 leading-7" {...strip(p)} />,
  ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6" {...strip(p)} />,
  ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6" {...strip(p)} />,
  li: (p) => <li className="leading-7" {...strip(p)} />,
  blockquote: (p) => (
    <blockquote
      className="my-4 border-l-4 border-border pl-4 text-muted-foreground"
      {...strip(p)}
    />
  ),
  hr: () => <hr className="my-8 border-border" />,
  code: (p) => <code className="rounded bg-surface-muted px-1 py-0.5 text-sm" {...strip(p)} />,
  table: (p) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...strip(p)} />
    </div>
  ),
  th: (p) => (
    <th className="border border-border px-3 py-2 text-left font-semibold" {...strip(p)} />
  ),
  td: (p) => <td className="border border-border px-3 py-2 align-top" {...strip(p)} />,
  // No pictures inside pages: only the picture's description is shown, as text.
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  a: ({ href, children }) => {
    // urlTransform already turned unsafe addresses into "" → plain text.
    if (!href) return <span>{children}</span>
    return (
      <a
        href={href}
        className="underline underline-offset-4 hover:text-muted-foreground"
        {...(isExternal(href) && { target: '_blank', rel: 'noopener noreferrer' })}
      >
        {children}
      </a>
    )
  },
}

/** react-markdown passes its syntax-tree `node`; don't put it on the DOM element. */
function strip<T extends { node?: unknown }>({ node: _node, ...rest }: T) {
  return rest
}

export interface MarkdownProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  children: string
}

export function Markdown({ children, className, ...props }: MarkdownProps) {
  return (
    <div className={cn('text-foreground', className)} {...props}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeMarkdownHref(url) ?? ''}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
