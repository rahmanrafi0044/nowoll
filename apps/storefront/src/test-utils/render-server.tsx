import { render } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

const isAsyncComponent = (type: unknown): type is (props: object) => Promise<ReactNode> =>
  typeof type === 'function' && type.constructor.name === 'AsyncFunction'

/**
 * Testing Library renders like a browser, and browsers can't run async Server
 * Components. Next.js resolves them on the server first; this helper does the
 * same in tests: it walks the tree, awaits every async component, then renders.
 */
export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree))
  if (!isValidElement(node)) return node
  const element = node as ReactElement<{ children?: ReactNode }>
  if (isAsyncComponent(element.type)) return resolveServerTree(await element.type(element.props))
  if (element.props.children === undefined) return element
  return cloneElement(element, undefined, await resolveServerTree(element.props.children))
}

export async function renderServer(tree: Promise<ReactNode> | ReactNode) {
  return render(<>{await resolveServerTree(await tree)}</>)
}
