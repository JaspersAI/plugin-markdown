# CLAUDE.md

The `markdown` plugin for Jaspers Terminal, written against `@jaspers-ai/sdk`. The app loads it from a folder in `~/Jaspers/plugins/markdown` (a clone of this repo, or an installed release) and rebuilds it on save. How plugins work, the SDK, and the app's side are in the terminal repo's CLAUDE.md.

## Commands

Node 24.

- `npm install`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Node's test runner over the `*.test.ts` files, which strips the types itself
- `npm run package` — `build/markdown-<version>.zip`, what a release attaches; the Release workflow runs it on a `v*` tag

Style: square, no rounded corners. Colours are the app's theme variables with the light value as fallback (`var(--jaspers-border, #e5e5e5)`, `var(--jaspers-muted-foreground, #737373)`), so a view follows the app's light and dark; a colour of the plugin's own gets its dark value under `@media (prefers-color-scheme: dark)`.

## The plugin

### The Markdown document

This repo holds one view, `markdown/doc` ("Document"), with no sources, connections, secrets, or backend: a document the orchestrator writes on the grid, whole, in GitHub-flavored Markdown. The user cannot edit it; `core/note` is the text the user types. Three `dependencies` go into the release archive: `mdast-util-from-markdown`, `mdast-util-gfm`, and `micromark-extension-gfm`, which read the Markdown as GitHub does.

- `doc.ts` is the pure half, tested in `doc.test.ts`: `StateSchema` (`{ markdown }`, required, up to 100,000 characters) and `OutputSchema`, `readMarkdown` (the state as main stores it, with no defaults applied), `parseDoc` (CommonMark plus tables, task lists, strikethrough, footnotes, and bare links, into an mdast tree), `linkHref` (https only, since main opens nothing else), `isLineBreak` (the `<br>` models put in table cells), `definitionsOf` (what reference links and images point at, from anywhere in the document, the first definition of a label winning), `docOutput` (the first heading's words as `title`, `characters`, and `outline`, the first 40 headings as `## Risks`, each cut to 80 characters, and headings dropped from the end until the JSON fits the 4,096 bytes main takes), `summarize` (the title, or the first line with words when the output is about an earlier document, cut to 60, with the length: `Q3 memo (4,210 chars)`; `Empty document`), and `docText` (a line naming the document, a blank line, then the Markdown as written; `null` when it is empty).
- `DocView.tsx` gates on the state like `ChartView`, then draws the tree as React elements: nothing becomes HTML from a string, so HTML reads as the text it is, except `<br>`. A tight list's items hold their words without paragraphs, as GitHub draws them; task items get ☑ or ☐ where the bullet would be. An https link opens through `openLink`, and any other reads as its words; an image cannot load in the frame, so an https one is a link named `Image: <alt>`. Footnotes stay where they are written. It publishes the output and the text, and a Copy button, shown while the pointer is on the document, puts the Markdown on the clipboard through `copyText`.
- `styles.css` reads the way the terminal's answer box does: the prose face (Charter) at 15px, headings at 22, 18, 16, and 15, tables in the interface face with figures of one width and a rule under each row, square bullets with muted markers, links underlined in the text's color, a line break inside a paragraph kept, prose lines capped at 80ch while tables and code take the whole width.
- The orchestrator drives it by state: `place_view { view: 'markdown/doc', state: { markdown: '# Q3 memo\n\n…' } }`, then `get panels/e1/text` for the whole document (the prompt shows only the first 2 KB of state) and `set panels/e1/state/markdown` with the whole new document, since a key path cannot reach inside the string. The instructions (`instructions.ts`) say so, and to place another document for a new piece of writing rather than replace this one. `state: {}` is refused, but a `place_view` with no state at all is not checked by main, and shows "Empty document." until the first `set`.
- The text is what a research analyst reads with `read_workspace` and quotes with `<cite panel="e1" quote="…">`, so it is the Markdown as written.
