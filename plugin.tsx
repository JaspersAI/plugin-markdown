import { definePlugin, defineView } from '@jaspers-ai/sdk'
import { OutputSchema, StateSchema, summarize } from './doc'
import { DocView } from './DocView'
import { INSTRUCTIONS } from './instructions'

// A Markdown document on the grid, for whatever the assistant puts in writing: a memo, a summary, a
// comparison table. The assistant writes the whole document into state, and the view draws it and
// publishes what it shows, with the Markdown as the panel's text, so a model can read it back at
// length and an analyst can quote it. No sources, no connections, no backend.

export default definePlugin({
  id: 'markdown',
  views: {
    doc: defineView(DocView, {
      title: 'Document',
      state: StateSchema,
      output: OutputSchema,
      instructions: INSTRUCTIONS,
      summarize,
    }),
  },
})
