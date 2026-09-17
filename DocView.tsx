import { Fragment, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { useBridge, useData, usePublish, usePublishText, type PanelRef } from '@jaspers-ai/sdk'
import type { Definition, List, ListItem, RootContent, Table } from 'mdast'
import { definitionsOf, docOutput, docText, isLineBreak, linkHref, parseDoc, readMarkdown } from './doc'
import './styles.css'

// The view: the Markdown in the panel's state, read into a tree and drawn as React elements. Nothing
// here becomes HTML from a string, so a document cannot inject markup: HTML reads as the text it is,
// except <br>. Links open in the browser through the bridge, https only, since the frame can open
// nothing itself. The title, length, and outline go out as the output, and the Markdown as the text.

/** How long the Copy button says Copied. */
const COPIED_MS = 1500

/**
 * The panel's state arrives a round trip after the frame mounts. Until it does there is no document,
 * and publishing an empty one would say the view shows nothing when it is about to show something.
 */
export function DocView({ panel }: { panel: PanelRef }): ReactElement {
  const state = useData(`workspaces/${panel.workspaceId}/panels/${panel.id}/state`)
  if (state === undefined) {
    return (
      <div className="md-root">
        <p className="md-empty">Loading…</p>
      </div>
    )
  }
  return <Doc panel={panel} markdown={readMarkdown(state)} />
}

/** What drawing a node needs beyond the node: the way to open a link, and what reference links point at. */
interface Render {
  open: (href: string) => void
  definitions: Map<string, Definition>
}

function Doc({ panel, markdown }: { panel: PanelRef; markdown: string }): ReactElement {
  const bridge = useBridge()
  const tree = useMemo(() => parseDoc(markdown), [markdown])
  const output = useMemo(() => docOutput(tree, markdown), [tree, markdown])
  usePublish(panel, output)
  usePublishText(panel, docText(markdown, output.title))
  const render = useMemo<Render>(
    () => ({
      open: (href) => void bridge.openLink(href).catch(() => undefined),
      definitions: definitionsOf(tree),
    }),
    [bridge, tree],
  )
  if (markdown.trim() === '') {
    return (
      <div className="md-root">
        <p className="md-empty">Empty document.</p>
      </div>
    )
  }
  return (
    <div className="md-root">
      {/* The document scrolls under the button, which stays in the corner. */}
      <div className="md-scroll">
        <article className="md-doc">{blocks(tree.children, render)}</article>
      </div>
      <CopyButton markdown={markdown} />
    </div>
  )
}

/** Puts the Markdown on the clipboard through main, since the frame has no clipboard of its own. */
function CopyButton({ markdown }: { markdown: string }): ReactElement {
  const bridge = useBridge()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className="md-copy"
      title="Copy the Markdown"
      onClick={() => {
        bridge.copyText(markdown).then(
          () => setCopied(true),
          () => undefined,
        )
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function blocks(nodes: RootContent[], render: Render): ReactNode[] {
  return nodes.map((node, i) => block(node, i, render))
}

function block(node: RootContent, key: number, render: Render): ReactNode {
  switch (node.type) {
    case 'heading': {
      const Tag = `h${node.depth}` as const
      return <Tag key={key}>{inlines(node.children, render)}</Tag>
    }
    case 'paragraph':
      return <p key={key}>{inlines(node.children, render)}</p>
    case 'list':
      return list(node, key, render)
    case 'code':
      return (
        <pre key={key}>
          <code>{node.value}</code>
        </pre>
      )
    case 'blockquote':
      return <blockquote key={key}>{blocks(node.children, render)}</blockquote>
    case 'table':
      return table(node, key, render)
    case 'thematicBreak':
      return <hr key={key} />
    case 'html':
      return isLineBreak(node.value) ? (
        <br key={key} />
      ) : (
        <p key={key} className="md-html">
          {node.value}
        </p>
      )
    case 'footnoteDefinition':
      return (
        <div key={key} className="md-footnote">
          <span className="md-footnote-label">[{node.label ?? node.identifier}]</span>
          <div>{blocks(node.children, render)}</div>
        </div>
      )
    case 'definition':
      return null
    default:
      return inline(node, key, render)
  }
}

/** A tight list's items hold their words directly, as GitHub draws them; a loose list's hold paragraphs. */
function list(node: List, key: number, render: Render): ReactNode {
  const loose = node.spread === true || node.children.some((item) => item.spread === true)
  const items = node.children.map((item, i) => listItem(item, i, loose, render))
  return node.ordered ? (
    <ol key={key} start={node.start ?? undefined}>
      {items}
    </ol>
  ) : (
    <ul key={key}>{items}</ul>
  )
}

function listItem(item: ListItem, key: number, loose: boolean, render: Render): ReactNode {
  const task = typeof item.checked === 'boolean'
  return (
    <li key={key} className={task ? 'md-task-item' : undefined}>
      {task && (
        <span className="md-task" role="img" aria-label={item.checked ? 'Done' : 'Not done'}>
          {item.checked ? '☑' : '☐'}
        </span>
      )}
      {item.children.map((child, i) =>
        !loose && child.type === 'paragraph' ? <Fragment key={i}>{inlines(child.children, render)}</Fragment> : block(child, i, render),
      )}
    </li>
  )
}

function table(node: Table, key: number, render: Render): ReactNode {
  const [head, ...rows] = node.children
  const align = (column: number) => node.align?.[column] ?? undefined
  return (
    <div key={key} className="md-table">
      <table>
        {head && (
          <thead>
            <tr>
              {head.children.map((cell, i) => (
                <th key={i} style={{ textAlign: align(i) }}>
                  {inlines(cell.children, render)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.children.map((cell, i) => (
                <td key={i} style={{ textAlign: align(i) }}>
                  {inlines(cell.children, render)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function inlines(nodes: RootContent[], render: Render): ReactNode[] {
  return nodes.map((node, i) => inline(node, i, render))
}

function inline(node: RootContent, key: number, render: Render): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value
    case 'emphasis':
      return <em key={key}>{inlines(node.children, render)}</em>
    case 'strong':
      return <strong key={key}>{inlines(node.children, render)}</strong>
    case 'delete':
      return <del key={key}>{inlines(node.children, render)}</del>
    case 'inlineCode':
      return <code key={key}>{node.value}</code>
    case 'break':
      return <br key={key} />
    case 'html':
      return isLineBreak(node.value) ? <br key={key} /> : node.value
    case 'link':
      return link(linkHref(node.url), inlines(node.children, render), key, render)
    case 'linkReference':
      return link(reference(node.identifier, render), inlines(node.children, render), key, render)
    case 'image':
      return image(linkHref(node.url), node.alt, key, render)
    case 'imageReference':
      return image(reference(node.identifier, render), node.alt, key, render)
    case 'footnoteReference':
      return (
        <sup key={key} className="md-footnote-ref">
          [{node.label ?? node.identifier}]
        </sup>
      )
    default:
      return 'children' in node ? <Fragment key={key}>{inlines(node.children, render)}</Fragment> : null
  }
}

/** An https link opens in the browser through main; any other reads as its words. */
function link(href: string | null, children: ReactNode, key: number, render: Render): ReactNode {
  if (!href) return <Fragment key={key}>{children}</Fragment>
  return (
    <a
      key={key}
      href={href}
      title={href}
      onClick={(event) => {
        event.preventDefault()
        render.open(href)
      }}
    >
      {children}
    </a>
  )
}

/** The frame loads no images, so an https image is a link to itself, named by its description. */
function image(href: string | null, alt: string | null | undefined, key: number, render: Render): ReactNode {
  const name = alt?.trim() || null
  return href ? link(href, `Image: ${name ?? href}`, key, render) : name
}

function reference(identifier: string, render: Render): string | null {
  const definition = render.definitions.get(identifier)
  return definition ? linkHref(definition.url) : null
}
