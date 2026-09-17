// What the orchestrator is told while a document is focused: the document is its to write, whole, and
// how to change part of one when the prompt shows only the first 2 KB of its state.

export const INSTRUCTIONS = [
  'A Markdown document you write. state.markdown is the whole document in GitHub-flavored Markdown: headings, paragraphs, lists (nested, numbered, task lists), tables, fenced code, quotes, links, strikethrough, footnotes. Setting it replaces everything shown. The user cannot edit it.',
  'To change part of it, read the whole current document with get panels/<id>/text (20,000 characters at a time, from offset; the first line names it and the Markdown follows a blank line), then set panels/<id>/state/markdown to the whole new document. Up to 100,000 characters.',
  'When the user asks for a new piece of writing while this document is on screen, place another document for it unless they ask to replace this one.',
  'Only https links work, and they open in the browser. Images do not load: an image shows as a link to it. HTML shows as the text it is, except <br>, which breaks the line, in a table cell too.',
  'output.title is the first heading, output.outline the headings in order (up to 40), and output.characters the length of the Markdown.',
].join('\n')
