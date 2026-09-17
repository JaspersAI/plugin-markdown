# plugin-markdown

A Markdown document for [Jaspers Terminal](https://github.com/JaspersAI), an open source, extensible desktop terminal for financial research.

One view, `markdown/doc`: a document the assistant writes on the grid in GitHub-flavored Markdown, with headings, nested and task lists, tables, code, quotes, links, and footnotes. Ask for a memo, a summary, or a comparison table on screen, and the assistant writes it there and rewrites it when you ask for changes. Analysts in a research room can read it and quote it.

## Install

In Jaspers Terminal, open Settings > Plugins, paste

```
https://github.com/JaspersAI/plugin-markdown
```

and press Install. The app downloads the latest release, shows where it came from, and asks before any of it runs. A plugin runs code on your computer with your permissions, so install plugins only from people you trust.

## Keys

None.

## Needs

Nothing else.

## Develop

```sh
git clone https://github.com/JaspersAI/plugin-markdown.git ~/Jaspers/plugins/markdown
cd ~/Jaspers/plugins/markdown
npm install
npm run typecheck
npm test
```

A folder you put in `~/Jaspers/plugins` is a plugin of your own, which the app rebuilds whenever you save. If this plugin is installed, remove it in Settings > Plugins first: the clone goes where the installed copy lives. Types come from [`@jaspers-ai/sdk`](https://www.npmjs.com/package/@jaspers-ai/sdk), which the app provides at run time.

## Release

Bump `version` in `package.json`, commit, and push a tag:

```sh
npm version patch
git push --follow-tags
```

The Release workflow checks the plugin and attaches `markdown-<version>.zip` to a GitHub release. Update in Settings > Plugins picks it up.

## License

[MIT](LICENSE)
