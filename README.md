# subnet

[![Build & Deploy](https://github.com/jparavisini/subnet/actions/workflows/build.yml/badge.svg)](https://github.com/jparavisini/subnet/actions/workflows/build.yml)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![Spec: CC-BY-SA-4.0](https://img.shields.io/badge/Spec-CC--BY--SA--4.0-blue.svg)](https://creativecommons.org/licenses/by-sa/4.0/)

An open standard for trusted networks of personal websites.

subnet is an open standard for building trusted networks of personal
websites. The protocol is three things: a JSON registry, a link-tag
handshake, and an Atom feed. People vouch for people. No algorithms,
no bots, no platform in the middle. This repo is a reference
implementation. Fork it, rewrite it, or build your own tools, any hub
that speaks the spec can peer with any other.

> **From Around My Subnets**
>
> [A Declaration of the Independence of Cyberspace](https://www.eff.org/cyberspace-independence) · 02/08/1996
> digitalfrontier.org · cyber-liberty-ring
>
> [The Cathedral and the Bazaar](http://www.catb.org/~esr/writings/cathedral-bazaar/) · 05/27/1997
> opensourcereview.net · bazaar-dev-webring
>
> [Markets Are Conversations](https://cluetrain.com/) · 03/15/1999
> cluetrainstation.com · dotcom-thinkers
>
> [How to Become a Hacker](http://www.catb.org/~esr/faqs/hacker-howto.html) · 09/12/1997
> hackculture.org · 2600-circle
>

Every node in a subnet can have a configurable widget like this on their
site to highlight recent posts from your neighbors. Each blog maintains
its own design.

---

## How it works

`subnet.json` in a Git repo is an entire single network. The repo owner (the
op) runs a hub — a static site that compiles node feeds into a single
Atom feed, an OPML file, and a widget script.

To join, you need a handshake:

1. Add `<link rel="subnet" href="[hub-url]">` to your site's `<head>`.
2. Open a PR adding yourself to `subnet.json`. CI verifies the tag.
3. An existing node approves the PR. The op merges it.

The hub checks for the tag on every rebuild. Remove it and you drop
out. Put it back and you reappear.

---

## Joining this subnet

1. Add `<link rel="subnet" href="https://jparavisini.github.io/subnet">` to your site's `<head>`.
2. Open a PR adding yourself to the `nodes` array in `subnet.json`:
   ```json
   { "url": "https://yoursite.com", "name": "Your Name", "feed": "https://yoursite.com/rss/" }
   ```
3. CI verifies the link tag. An existing node approves the PR. The op merges it.

Then add the widget to your site:

```html
<script src="https://jparavisini.github.io/subnet/widget.js"></script>

<subnet-widget hubs="https://jparavisini.github.io/subnet" count="5">
  <noscript><a href="https://jparavisini.github.io/subnet">Subnet</a></noscript>
</subnet-widget>
```

Multiple subnets? List them comma-separated in `hubs`. The `display`
attribute controls output: `feed` (default), `nav`, or `both`.
You can also self-host `widget.js` — it has no dependencies.

---

## Starting your own subnet

Fork or clone this repo, then edit `subnet.json`:

```json
{
  "subnet": {
    "version": "1.0",
    "hub": "https://you.github.io/your-repo",
    "handshakes_required": 1
  },
  "nodes": [
    {
      "url": "https://yoursite.com",
      "name": "Your Name",
      "feed": "https://yoursite.com/rss/"
    }
  ],
  "peers": [
    { "name": "subnet", "hub": "https://jparavisini.github.io/subnet" }
  ]
}
```

Optional subnet metadata:

| Field | Effect |
|-------|--------|
| `title` | Hub page heading, Atom feed title, OPML title. Falls back to hub URL. |
| `name` | URL-safe slug. Vanity label only — the hub URL is the identifier. |
| `description` | Hub page subtitle, Atom feed subtitle. Omitted if not set. |

Set `hub` to your own GitHub Pages URL, replace the seed node with
yourself, and enable GitHub Pages (source: GitHub Actions). The included
workflow builds daily and on every push. Any static host works — the
build script is a standalone Node.js program with zero dependencies.

---

## Peering with other subnets

Subnets can peer with each other. When you add a peer, the hub fetches
that peer's `feed.xml` on every build and merges its posts into your
hub's feed and recent-posts list — so your members see posts from both
networks. To peer, open a PR adding a hub URL to the `peers` array in
another subnet's repo (or this one):

```json
"peers": [
  { "name": "pixel-dungeon", "hub": "https://example.net/pixel-dungeon" }
]
```

You can peer with any subnet hub that accepts the PR — it doesn't have
to be this one. Peering is one-directional: adding a peer pulls their
posts into your hub. For both hubs to show each other's posts, both
repos need the peering entry.

---

## Specification (v1.0)

A conforming hub serves three things at its root URL:

1. **`subnet.json`** — the network registry. Conforms to [`schema/subnet.schema.json`](schema/subnet.schema.json).
2. **`<link rel="subnet" href="[hub-url]">`** — present in each member site's `<head>`. The handshake: proves membership, verified on every build.
3. **`feed.xml`** — an [Atom](https://www.rfc-editor.org/rfc/rfc4287) (RFC 4287) feed at the hub root, aggregating member posts.

Everything else — the builder, the widget, the hub page, the styles,
the CI — is implementation. This repo is one reference implementation
built on [OPML 2.0](http://opml.org/spec2.opml),
[JSON Schema](https://json-schema.org/) (draft 2020-12), and
[Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components).

---

## License

Code: [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)
Specification: [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)
