import assert from 'node:assert/strict'
import { test } from 'node:test'
import { definitionsOf, docOutput, docText, isLineBreak, linkHref, OutputSchema, parseDoc, readMarkdown, StateSchema, summarize } from './doc.ts'

// The plugin's pure half: the state a panel holds read the forgiving way, the Markdown read into a
// tree, which links may open, the <br> models put in table cells, and what the view publishes.

/** What the view publishes for a source, read the way the view reads it. */
const outputOf = (source: string) => docOutput(parseDoc(source), source)

test('state reads its markdown, and anything else as an empty document', () => {
  assert.equal(readMarkdown({ markdown: '# Q3 memo' }), '# Q3 memo')
  assert.equal(readMarkdown({}), '')
  assert.equal(readMarkdown(null), '')
  assert.equal(readMarkdown(undefined), '')
  assert.equal(readMarkdown({ markdown: 42 }), '')
  assert.equal(readMarkdown('# Q3 memo'), '')
})

test('only https links open', () => {
  assert.equal(linkHref('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany'), 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany')
  assert.equal(linkHref('HTTPS://WWW.SEC.GOV/'), 'HTTPS://WWW.SEC.GOV/')
  assert.equal(linkHref('http://www.sec.gov/'), null)
  assert.equal(linkHref('javascript:alert(1)'), null)
  assert.equal(linkHref('mailto:ir@example.com'), null)
  assert.equal(linkHref('/filings/10-k'), null)
  assert.equal(linkHref('#risks'), null)
  assert.equal(linkHref(''), null)
})

test('a <br> tag is a line break, and no other tag is', () => {
  for (const tag of ['<br>', '<br/>', '<br />', '<BR>']) assert.equal(isLineBreak(tag), true, tag)
  for (const tag of ['<b>', '<brx>', '<br class="x">', '</br>', 'br', '<br><br>']) assert.equal(isLineBreak(tag), false, tag)
})

test('the Markdown is read as GitHub writes it: tables, task lists, strikethrough, footnotes, bare links', () => {
  const tree = parseDoc('| Segment | Revenue |\n| --- | ---: |\n| Consumer | $1.2B |\n\n- [x] ~~Q2~~ done[^1]\n\nhttps://www.sec.gov\n\n[^1]: Filed late.')
  assert.deepEqual(
    tree.children.map((node) => node.type),
    ['table', 'list', 'paragraph', 'footnoteDefinition'],
  )
  const table = tree.children[0]
  assert.equal(table?.type === 'table' && table.align?.[1], 'right')
  const item = tree.children[1]?.type === 'list' ? tree.children[1].children[0] : undefined
  assert.equal(item?.checked, true)
  const paragraph = item?.children[0]
  assert.deepEqual(
    paragraph?.type === 'paragraph' ? paragraph.children.map((node) => node.type) : [],
    ['delete', 'text', 'footnoteReference'],
  )
  const bare = tree.children[2]
  assert.deepEqual(bare?.type === 'paragraph' ? bare.children.map((node) => node.type) : [], ['link'])
})

test('entities are read as the characters they stand for', () => {
  const paragraph = parseDoc('R&amp;D up 12% &gt; plan').children[0]
  const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined
  assert.equal(text?.type === 'text' && text.value, 'R&D up 12% > plan')
})

test('a line break inside a paragraph stays in its text', () => {
  const paragraph = parseDoc('Revenue $1.2B\nMargin 38%').children[0]
  const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined
  assert.equal(text?.type === 'text' && text.value, 'Revenue $1.2B\nMargin 38%')
})

test('reference links find their definitions, whatever the case of the label', () => {
  const tree = parseDoc('See the [10-K][Annual].\n\n[annual]: https://www.sec.gov/10k "Annual report"')
  const definition = definitionsOf(tree).get('annual')
  assert.equal(definition?.url, 'https://www.sec.gov/10k')
  assert.equal(definitionsOf(parseDoc('No links here.')).size, 0)
})

test('a definition inside a quote or a list item counts for the whole document', () => {
  const tree = parseDoc('Read [the 10-K][k] and [the 10-Q][q].\n\n> [k]: https://www.sec.gov/10k\n\n- Sources\n\n  [q]: https://www.sec.gov/10q')
  const definitions = definitionsOf(tree)
  assert.equal(definitions.get('k')?.url, 'https://www.sec.gov/10k')
  assert.equal(definitions.get('q')?.url, 'https://www.sec.gov/10q')
})

test('the first definition of a label wins, as CommonMark says', () => {
  const tree = parseDoc('[k][]\n\n[k]: https://www.sec.gov/first\n[K]: https://www.sec.gov/second')
  assert.equal(definitionsOf(tree).get('k')?.url, 'https://www.sec.gov/first')
})

test('the title is the first heading, whatever its depth, as plain text, and the outline lists the headings in order', () => {
  assert.deepEqual(outputOf('Intro.\n\n## Q3 **memo**, `v2` [draft](https://www.sec.gov)\n\n# Later'), {
    title: 'Q3 memo, v2 draft',
    characters: 66,
    outline: ['## Q3 memo, v2 draft', '# Later'],
  })
})

test('a document with no heading has no title and no outline', () => {
  assert.deepEqual(outputOf('Revenue grew 12%.'), { title: null, characters: 17, outline: [] })
})

test('a line that only looks like a heading, inside code, is not one', () => {
  assert.deepEqual(outputOf('```\n# not a heading\n```'), { title: null, characters: 23, outline: [] })
})

test('an underlined heading is a heading, and an empty one is skipped', () => {
  assert.deepEqual(outputOf('#\n\nQ3 memo\n=======\n\n> ### Quoted'), {
    title: 'Q3 memo',
    characters: 32,
    outline: ['# Q3 memo', '### Quoted'],
  })
})

test('the outline lists the first 40 headings, each cut to 80 characters', () => {
  const headings = Array.from({ length: 50 }, (_, i) => `## H${i + 1}`).join('\n\n')
  const outline = outputOf(headings).outline
  assert.equal(outline.length, 40)
  assert.equal(outline[0], '## H1')
  assert.equal(outline[39], '## H40')
  const long = outputOf(`# ${'x'.repeat(100)}`)
  assert.equal(long.title, `${'x'.repeat(79)}…`)
  assert.deepEqual(long.outline, [`# ${'x'.repeat(79)}…`])
})

test('the output keeps as many headings as fit the 4,096 bytes main takes, first ones first', () => {
  const heading = (n: number) => `${'収'.repeat(78)}${String(n).padStart(2, '0')}`
  const source = Array.from({ length: 40 }, (_, i) => `# ${heading(i)}`).join('\n\n')
  const output = outputOf(source)
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
  assert.ok(bytes(output) <= 4096, `${bytes(output)} bytes`)
  assert.equal(output.outline[0], `# ${heading(0)}`)
  const next = `# ${heading(output.outline.length)}`
  assert.ok(bytes({ ...output, outline: [...output.outline, next] }) > 4096, 'dropped a heading that fit')
})

test('what the view publishes passes the output schema main checks it against', () => {
  for (const source of ['', 'Plain.', '# Q3\n\n## Risks']) {
    assert.equal(OutputSchema.safeParse(outputOf(source)).success, true, source)
  }
})

test('the state takes a document of up to 100,000 characters, and must have one', () => {
  assert.equal(StateSchema.safeParse({ markdown: '' }).success, true)
  assert.equal(StateSchema.safeParse({ markdown: 'x'.repeat(100_000) }).success, true)
  assert.equal(StateSchema.safeParse({ markdown: 'x'.repeat(100_001) }).success, false)
  assert.equal(StateSchema.safeParse({}).success, false)
  assert.equal(StateSchema.safeParse({ markdown: 3 }).success, false)
})

test('an empty document says so in the map', () => {
  assert.equal(summarize({ markdown: '' }, { title: null, characters: 0, outline: [] }), 'Empty document')
  assert.equal(summarize({ markdown: ' \n\t\n' }, { title: null, characters: 4, outline: [] }), 'Empty document')
  assert.equal(summarize({}, undefined), 'Empty document')
})

test('the map names the document by its title, with its length', () => {
  const markdown = `# Q3 memo\n\n${'x'.repeat(1223)}`
  assert.equal(summarize({ markdown }, { title: 'Q3 memo', characters: 1234, outline: ['# Q3 memo'] }), 'Q3 memo (1,234 chars)')
})

test('with no title, the map takes the first line with words', () => {
  const markdown = '\n\n  Revenue grew 12%  \nMargins flat'
  assert.equal(summarize({ markdown }, { title: null, characters: 35, outline: [] }), 'Revenue grew 12% (35 chars)')
})

test('an output about an earlier document says nothing about this one', () => {
  const stale = { title: 'Old memo', characters: 999, outline: ['# Old memo'] }
  assert.equal(summarize({ markdown: 'Revenue grew 12%' }, stale), 'Revenue grew 12% (16 chars)')
  assert.equal(summarize({ markdown: 'Revenue grew 12%' }, undefined), 'Revenue grew 12% (16 chars)')
})

test('a long first line is cut to 60 characters in the map', () => {
  assert.equal(summarize({ markdown: 'y'.repeat(100_000) }, undefined), `${'y'.repeat(59)}… (100,000 chars)`)
})

test('the text is a line naming the document, then its Markdown as written', () => {
  assert.equal(docText('# Q3 memo\n\n| a |\n| - |', 'Q3 memo'), 'Q3 memo\n\n# Q3 memo\n\n| a |\n| - |')
  assert.equal(docText('Body only', null), 'Document\n\nBody only')
})

test('an empty document has no text', () => {
  assert.equal(docText('', null), null)
  assert.equal(docText(' \n ', 'Q3 memo'), null)
})
