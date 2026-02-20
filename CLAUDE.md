# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

subnet is an open standard (v1.0) for trusted networks of personal websites. The protocol is three things: a JSON registry (`subnet.json`), a `<link rel="subnet">` handshake, and an Atom feed (`feed.xml`). This repo is the reference implementation — a zero-dependency Node.js static site generator that builds a hub from `subnet.json`.

## Commands

- `npm run build` — generates `_site/` (fetches feeds, verifies link tags, renders templates)
- `npm run verify` — checks all nodes have the required link tag (CI runs this on PRs)

No install step. Zero npm dependencies. Requires Node 18+.

## Architecture

**Spec vs implementation:** The spec is `subnet.json` (validated by `schema/subnet.schema.json`), the `<link rel="subnet">` tag, and `feed.xml` at the hub root. Everything else — the builder, widget, templates, styles — is this implementation.

**Build pipeline (`src/build.js`):**
1. Reads `subnet.json`
2. Fetches each node's HTML, verifies `<link rel="subnet">` tag → active nodes
3. Fetches RSS/Atom feeds from active nodes (regex-based parsing, no DOM)
4. Fetches peer hub metadata from `{peer.hub}/subnet.json`
5. Renders templates, generates Atom feed + OPML, writes to `_site/`

**Templating:** Simple `{{key}}` string replacement in `renderTemplate()`. No conditionals or loops — list HTML is built in the generator functions and passed as pre-rendered strings. Keep HTML in templates, pass only data/URLs from JS.

**Key files:**
- `src/build.js` — main builder, all generation logic
- `src/verify.js` — link tag checker (CI gate)
- `src/widget.js` — embeddable Web Component (Shadow DOM, localStorage cache, CSS custom properties)
- `schema/subnet.schema.json` — JSON Schema (draft 2020-12), versioned
- `templates/` — hub page and join page HTML
- `static/style.css` — minimal CSS with dark mode

**Output (`_site/`):** `index.html`, `join/index.html`, `feed.xml`, `subnet.opml`, `subnet.json`, `widget.js`, `style.css`

## CI/CD

- **PR:** `verify.yml` runs `npm run verify` — fails if any node is missing the link tag
- **Push to main / daily / manual:** `build.yml` runs `npm run build`, deploys `_site/` to GitHub Pages

## Key Patterns

- Feeds are parsed with regex (no XML library) — handles RSS 2.0, Atom 1.0, CDATA
- Link tag verification handles both attribute orders (`rel` before `href` and vice versa)
- Trailing slashes are stripped for URL comparison
- Peer metadata fetch fails gracefully — falls back to local `name`/`hub` from `peers` array
- Widget caches in localStorage with 30-min TTL, filters out current host's posts
- `deriveRepoUrl()` converts GitHub Pages URLs to GitHub repo URLs
