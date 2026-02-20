#!/usr/bin/env node

// subnet hub builder — zero dependencies, Node 18+
// Reads subnet.json, verifies link tags, fetches feeds, generates _site/

import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "_site");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTemplate(templatePath, vars) {
  const absPath = resolve(ROOT, templatePath);
  let html = readFileSync(absPath, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toIso(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Link-tag verification
// ---------------------------------------------------------------------------

async function hasLinkTag(siteUrl, hubUrl) {
  try {
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": "subnet-hub-builder/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return false;
    const html = await res.text();
    // Match <link rel="subnet" href="...hub...">
    const pattern = /<link[^>]+rel=["']subnet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    const patternAlt = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']subnet["'][^>]*>/gi;
    for (const re of [pattern, patternAlt]) {
      let match;
      while ((match = re.exec(html)) !== null) {
        const href = match[1].replace(/\/+$/, "");
        const hub = hubUrl.replace(/\/+$/, "");
        if (href === hub) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Feed parsing (RSS 2.0 + Atom 1.0 via regex — no DOM parser in Node)
// ---------------------------------------------------------------------------

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return m[1].trim().replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function parseAtomEntries(xml) {
  const entries = [];
  const re = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link =
      extractAttr(block, 'link[^>]*rel=["\']*alternate', "href") ||
      extractAttr(block, "link", "href");
    const published = extractTag(block, "published") || extractTag(block, "updated");
    const author = extractTag(extractTag(block, "author"), "name");
    if (title && link) {
      entries.push({ title, link, published: toIso(published), author });
    }
  }
  return entries;
}

function parseRssEntries(xml) {
  const entries = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const published = extractTag(block, "pubDate") || extractTag(block, "dc:date");
    const author =
      extractTag(block, "dc:creator") ||
      extractTag(block, "author") ||
      extractTag(block, "itunes:author");
    if (title && link) {
      entries.push({ title, link, published: toIso(published), author });
    }
  }
  return entries;
}

function parseFeed(xml) {
  if (/<feed[\s>]/i.test(xml)) return parseAtomEntries(xml);
  if (/<rss[\s>]/i.test(xml) || /<channel[\s>]/i.test(xml)) return parseRssEntries(xml);
  return [];
}

// ---------------------------------------------------------------------------
// Fetch a node's feed
// ---------------------------------------------------------------------------

async function fetchFeed(feedUrl) {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "subnet-hub-builder/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Peer metadata
// ---------------------------------------------------------------------------

async function fetchPeerMeta(peer) {
  const hubUrl = peer.hub.replace(/\/+$/, "");
  try {
    const res = await fetch(`${hubUrl}/subnet.json`, {
      headers: { "User-Agent": "subnet-hub-builder/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { name: peer.name, hub: peer.hub };
    const data = await res.json();
    const s = data.subnet || {};
    const nodeCount = Array.isArray(data.nodes) ? data.nodes.length : 0;
    return {
      name: s.title || peer.name,
      hub: peer.hub,
      description: s.description || null,
      nodeCount,
    };
  } catch {
    return { name: peer.name, hub: peer.hub };
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function generateAtomFeed(subnet, entries) {
  const now = new Date().toISOString();
  const title = subnet.title || subnet.hub;
  const items = entries
    .map(
      (e) => `  <entry>
    <title>${escapeXml(e.title)}</title>
    <link href="${escapeXml(e.link)}" rel="alternate"/>
    <id>${escapeXml(e.link)}</id>
    <updated>${e.published || now}</updated>${
        e.author
          ? `
    <author><name>${escapeXml(e.author)}</name></author>`
          : ""
      }
    <category term="${escapeXml(e.subnetName)}"/>
  </entry>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>${subnet.description ? `
  <subtitle>${escapeXml(subnet.description)}</subtitle>` : ""}
  <link href="${escapeXml(subnet.hub + "/feed.xml")}" rel="self"/>
  <link href="${escapeXml(subnet.hub)}" rel="alternate"/>
  <id>${escapeXml(subnet.hub)}</id>
  <updated>${now}</updated>
${items}
</feed>
`;
}

function generateOpml(subnet, nodes) {
  const title = subnet.title || subnet.hub;
  const outlines = nodes
    .map(
      (n) =>
        `      <outline type="rss" text="${escapeXml(n.name)}" title="${escapeXml(n.name)}" xmlUrl="${escapeXml(n.feed)}" htmlUrl="${escapeXml(n.url)}"/>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="${escapeXml(title)}" title="${escapeXml(title)}">
${outlines}
    </outline>
  </body>
</opml>
`;
}

function generateIndexHtml(subnet, activeNodes, entries, peers) {
  const title = escapeHtml(subnet.title || subnet.hub);
  const description = subnet.description
    ? `\n    <p class="desc">${escapeHtml(subnet.description)}</p>`
    : "";

  const nodeList = activeNodes
    .map(
      (n) =>
        `      <li><a href="${escapeHtml(n.url)}">${escapeHtml(n.name)}</a> &mdash; <a href="${escapeHtml(n.feed)}">feed</a></li>`
    )
    .join("\n");

  const postList = entries
    .slice(0, 50)
    .map((e) => {
      const date = e.published ? new Date(e.published).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
      const author = e.author ? ` &middot; ${escapeHtml(e.author)}` : "";
      return `      <li><a href="${escapeHtml(e.link)}">${escapeHtml(e.title)}</a>${date ? ` <time datetime="${e.published}">${escapeHtml(date)}</time>` : ""}${author}</li>`;
    })
    .join("\n");

  const repoUrl = escapeHtml(deriveRepoUrl(subnet.hub) || subnet.hub);

  let peerSection = "";
  if (peers.length > 0) {
    const peerItems = peers
      .map((p) => {
        const meta = [];
        if (p.nodeCount) meta.push(`${p.nodeCount} node${p.nodeCount === 1 ? "" : "s"}`);
        if (p.description) meta.push(escapeHtml(p.description));
        const suffix = meta.length > 0 ? ` &mdash; ${meta.join(" &middot; ")}` : "";
        return `      <li><a href="${escapeHtml(p.hub)}">${escapeHtml(p.name)}</a>${suffix}</li>`;
      })
      .join("\n");
    peerSection = `\n    <section>\n      <h2>Peers</h2>\n      <ul>\n${peerItems}\n      </ul>\n    </section>`;
  }

  return renderTemplate("templates/index.html", {
    title,
    description,
    repoUrl,
    hubUrl: escapeHtml(subnet.hub),
    nodeList,
    postList,
    peerSection,
  });
}

function deriveRepoUrl(hubUrl) {
  // https://user.github.io/repo -> https://github.com/user/repo
  try {
    const u = new URL(hubUrl);
    const m = u.hostname.match(/^(.+)\.github\.io$/);
    if (m) return `https://github.com/${m[1]}${u.pathname.replace(/\/+$/, "")}`;
  } catch { /* fall through */ }
  return null;
}

function generateJoinHtml(subnet) {
  const title = escapeHtml(subnet.title || subnet.hub);
  const hubUrl = escapeHtml(subnet.hub);
  const editUrl = deriveRepoUrl(subnet.hub);

  return renderTemplate("templates/join.html", {
    title,
    hubUrl,
    editUrl: escapeHtml(editUrl ? editUrl + "/edit/main/subnet.json" : subnet.hub),
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const subnetPath = resolve(ROOT, "subnet.json");
  const data = JSON.parse(readFileSync(subnetPath, "utf-8"));
  const subnet = data.subnet;
  const label = subnet.title || subnet.hub;
  const nodes = data.nodes || [];

  console.log(`Building hub for ${label} (${nodes.length} nodes)`);

  // Verify link tags and collect active nodes
  const activeNodes = [];
  for (const node of nodes) {
    process.stdout.write(`  Checking ${node.url} ... `);
    const ok = await hasLinkTag(node.url, subnet.hub);
    if (ok) {
      activeNodes.push(node);
      console.log("ok");
    } else {
      console.log("MISSING link tag, skipping");
    }
  }

  if (nodes.length > 0) {
    console.log(`${activeNodes.length}/${nodes.length} nodes active`);
  }

  // Fetch feeds from active nodes
  const allEntries = [];
  for (const node of activeNodes) {
    process.stdout.write(`  Fetching feed ${node.feed} ... `);
    const entries = await fetchFeed(node.feed);
    for (const entry of entries) {
      entry.author = entry.author || node.name;
      entry.subnetName = subnet.hub;
    }
    allEntries.push(...entries);
    console.log(`${entries.length} entries`);
  }

  // Sort by date descending
  allEntries.sort((a, b) => {
    const da = a.published ? new Date(a.published).getTime() : 0;
    const db = b.published ? new Date(b.published).getTime() : 0;
    return db - da;
  });

  // Fetch peer metadata and feeds
  const peers = data.peers || [];
  const peerMeta = [];
  for (const peer of peers) {
    process.stdout.write(`  Fetching peer ${peer.hub} ... `);
    const meta = await fetchPeerMeta(peer);
    peerMeta.push(meta);
    console.log(meta.nodeCount != null ? `${meta.nodeCount} nodes` : "fallback to local data");

    const peerFeedUrl = peer.hub.replace(/\/+$/, "") + "/feed.xml";
    process.stdout.write(`  Fetching peer feed ${peerFeedUrl} ... `);
    const peerEntries = await fetchFeed(peerFeedUrl);
    for (const entry of peerEntries) {
      entry.subnetName = meta.name || peer.name;
    }
    allEntries.push(...peerEntries);
    console.log(`${peerEntries.length} entries`);
  }

  // Re-sort after adding peer entries
  allEntries.sort((a, b) => {
    const da = a.published ? new Date(a.published).getTime() : 0;
    const db = b.published ? new Date(b.published).getTime() : 0;
    return db - da;
  });

  // Write output
  mkdirSync(OUT, { recursive: true });

  writeFileSync(resolve(OUT, "feed.xml"), generateAtomFeed(subnet, allEntries));
  console.log("  Wrote feed.xml");

  writeFileSync(resolve(OUT, "subnet.opml"), generateOpml(subnet, activeNodes));
  console.log("  Wrote subnet.opml");

  writeFileSync(resolve(OUT, "index.html"), generateIndexHtml(subnet, activeNodes, allEntries, peerMeta));
  console.log("  Wrote index.html");

  mkdirSync(resolve(OUT, "join"), { recursive: true });
  writeFileSync(resolve(OUT, "join/index.html"), generateJoinHtml(subnet));
  console.log("  Wrote join/index.html");

  cpSync(subnetPath, resolve(OUT, "subnet.json"));
  console.log("  Copied subnet.json");

  cpSync(resolve(ROOT, "src", "widget.js"), resolve(OUT, "widget.js"));
  console.log("  Copied widget.js");

  cpSync(resolve(ROOT, "static", "style.css"), resolve(OUT, "style.css"));
  console.log("  Copied style.css");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
