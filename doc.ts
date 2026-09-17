import type { Definition, Nodes, Root, RootContent } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { z } from 'zod'

// The document's pure half: the state read the forgiving way, the Markdown read into a tree the view
// renders as React elements (never as HTML), which links may open, and what the view publishes about
// it. Pure, so all of it can be checked in a test.

/** The longest document the state takes, in characters. The whole tree goes to every window on every change. */
export const MARKDOWN_MAX = 100_000
/** The headings the outline lists, and how much of each heading, in characters. */
const OUTLINE_MAX = 40
const HEADING_MAX = 80
/** How much of the title the map line carries, in characters. */
const SUMMARY_MAX = 60
/** The most main takes as one publish, in bytes of JSON. */
const PUBLISH_MAX = 4096
/** A <br> models put in a table cell, or anywhere, for a line break. */
const LINE_BREAK = /^<br\s*\/?>$/i

export const StateSchema = z.object({
  markdown: z
    .string()
    .max(MARKDOWN_MAX)
    .describe('The whole document in GitHub-flavored Markdown. Setting it replaces what is shown.'),
})

export const OutputSchema = z.object({
  title: z.string().nullable(),
  characters: z.number().int().nonnegative(),
  outline: z.array(z.string()),
})

export type DocOutput = z.infer<typeof OutputSchema>

/** The Markdown in a panel's state as main stores it, as written, with no defaults applied. */
export function readMarkdown(state: unknown): string {
  const markdown = record(state)?.['markdown']
  return typeof markdown === 'string' ? markdown : ''
}

/** The Markdown as GitHub reads it: CommonMark plus tables, task lists, strikethrough, footnotes, and bare links. */
export function parseDoc(source: string): Root {
  return fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
}

/** The address a link opens, or null: main opens https links only, so nothing else is a link here. */
export function linkHref(url: string): string | null {
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function isLineBreak(html: string): boolean {
  return LINE_BREAK.test(html)
}

/**
 * The definitions reference links and images point at, by the normalized label mdast gives both. A
 * definition inside a quote or a list item counts for the whole document.
 */
export function definitionsOf(tree: Root): Map<string, Definition> {
  const found = new Map<string, Definition>()
  const visit = (nodes: RootContent[]): void => {
    for (const node of nodes) {
      if (node.type === 'definition') {
        if (!found.has(node.identifier)) found.set(node.identifier, node)
      } else if ('children' in node) visit(node.children)
    }
  }
  visit(tree.children)
  return found
}

/** What the output says about the document: its title, how long it is, and its headings, in order. */
export function docOutput(tree: Root, source: string): DocOutput {
  const headings = headingsOf(tree)
  const output: DocOutput = {
    title: headings[0] ? cut(headings[0].text, HEADING_MAX) : null,
    characters: source.length,
    outline: headings.slice(0, OUTLINE_MAX).map((heading) => `${'#'.repeat(heading.depth)} ${cut(heading.text, HEADING_MAX)}`),
  }
  while (output.outline.length > 0 && byteLength(JSON.stringify(output)) > PUBLISH_MAX) output.outline.pop()
  return output
}

/** The line the model's map carries: the document's title, or its first line with words, and its length. */
export function summarize(state: unknown, output: unknown): string {
  const markdown = readMarkdown(state)
  if (markdown.trim() === '') return 'Empty document'
  const published = record(output)
  // An output the view published for an earlier document says nothing about this one.
  const title = published?.['characters'] === markdown.length && typeof published['title'] === 'string' ? published['title'] : null
  return `${cut(title ?? firstLine(markdown), SUMMARY_MAX)} (${thousands(markdown.length)} chars)`
}

/** The panel's text: a line naming the document, which a citation of it takes as its title, then the Markdown as written. */
export function docText(markdown: string, title: string | null): string | null {
  return markdown.trim() === '' ? null : `${title ?? 'Document'}\n\n${markdown}`
}

/** Every heading with words in it, in document order, quotes and list items included. */
function headingsOf(tree: Root): { depth: number; text: string }[] {
  const found: { depth: number; text: string }[] = []
  const visit = (nodes: RootContent[]): void => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        const text = plainText(node)
        if (text) found.push({ depth: node.depth, text })
      } else if ('children' in node) visit(node.children)
    }
  }
  visit(tree.children)
  return found
}

/** A node's words as a reader sees them: marks dropped, code and image descriptions kept, spacing collapsed. */
function plainText(node: Nodes): string {
  const words = (current: Nodes): string => {
    if (current.type === 'text' || current.type === 'inlineCode') return current.value
    if (current.type === 'image' || current.type === 'imageReference') return current.alt ?? ''
    if (current.type === 'break') return ' '
    return 'children' in current ? current.children.map(words).join('') : ''
  }
  return words(node).replace(/\s+/g, ' ').trim()
}

/** At most max characters, the last one an ellipsis when anything was cut. Characters, not UTF-16 halves. */
function cut(text: string, max: number): string {
  const characters = Array.from(text)
  return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : text
}

function firstLine(markdown: string): string {
  return markdown.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? ''
}

/** 100000 as 100,000, the same in any locale. */
function thousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
