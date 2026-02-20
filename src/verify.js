#!/usr/bin/env node

// subnet link-tag verifier — runs on PRs to ensure every node has the tag
// Exits non-zero if any node is missing <link rel="subnet" href="[hub]">

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function checkLinkTag(siteUrl, hubUrl) {
  try {
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": "subnet-verify/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const html = await res.text();

    const pattern = /<link[^>]+rel=["']subnet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    const patternAlt = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']subnet["'][^>]*>/gi;

    const hub = hubUrl.replace(/\/+$/, "");
    for (const re of [pattern, patternAlt]) {
      let match;
      while ((match = re.exec(html)) !== null) {
        const href = match[1].replace(/\/+$/, "");
        if (href === hub) return { ok: true };
      }
    }
    return { ok: false, reason: "link tag not found" };
  } catch (err) {
    return { ok: false, reason: err.message || "fetch failed" };
  }
}

async function main() {
  const data = JSON.parse(readFileSync(resolve(ROOT, "subnet.json"), "utf-8"));
  const subnet = data.subnet;
  const nodes = data.nodes || [];

  if (nodes.length === 0) {
    console.log("No nodes to verify.");
    process.exit(0);
  }

  const label = subnet.title || subnet.hub;
  console.log(`Verifying ${nodes.length} node(s) for ${label}\n`);

  let failures = 0;

  for (const node of nodes) {
    process.stdout.write(`  ${node.name} (${node.url}) ... `);
    const result = await checkLinkTag(node.url, subnet.hub);
    if (result.ok) {
      console.log("ok");
    } else {
      console.log(`FAIL: ${result.reason}`);
      failures++;
    }
  }

  console.log();

  if (failures > 0) {
    console.error(
      `${failures} node(s) missing <link rel="subnet" href="${subnet.hub}">`,
    );
    process.exit(1);
  }

  console.log("All nodes verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
