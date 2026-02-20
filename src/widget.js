// subnet widget — Web Component with Shadow DOM
// <subnet-widget hubs="https://hub1,https://hub2" count="5" display="feed">
//   <noscript><a href="https://hub1">Subnet</a></noscript>
// </subnet-widget>

class SubnetWidget extends HTMLElement {
  static get observedAttributes() {
    return ["hubs", "count", "display"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  async _render() {
    const hubList = (this.getAttribute("hubs") || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const maxCount = parseInt(this.getAttribute("count") || "5", 10);
    const display = this.getAttribute("display") || "feed";

    if (hubList.length === 0) return;

    const allEntries = [];
    const subnetMeta = [];

    for (const hub of hubList) {
      const feedUrl = hub.replace(/\/+$/, "") + "/feed.xml";
      const data = await this._fetchFeed(feedUrl, hub);
      if (data) {
        allEntries.push(...data.entries);
        subnetMeta.push(data.meta);
      }
    }

    allEntries.sort((a, b) => {
      const da = a.published ? new Date(a.published).getTime() : 0;
      const db = b.published ? new Date(b.published).getTime() : 0;
      return db - da;
    });

    const root = this.shadowRoot;
    while (root.firstChild) root.removeChild(root.firstChild);

    // Hide completely when there's nothing to show
    if (allEntries.length === 0 && subnetMeta.length === 0) {
      this.style.display = "none";
      return;
    }
    this.style.display = "";

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        font-family: inherit;
        line-height: 1.5;
        color: var(--subnet-fg, inherit);
      }
      section {
        border: 1px solid var(--subnet-border, #ddd);
        border-radius: var(--subnet-radius, 4px);
        padding: var(--subnet-padding, 0.75rem 1rem);
        background: var(--subnet-bg, transparent);
        font-size: var(--subnet-font-size, 0.9em);
      }
      @media (prefers-color-scheme: dark) {
        section {
          border-color: var(--subnet-border, #333);
        }
      }
      h2 {
        font-weight: 600;
        margin-block-end: 0.5rem;
        font-size: 0.85em;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.7;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        margin-bottom: 0.4rem;
      }
      li a {
        color: var(--subnet-link, inherit);
        text-decoration: none;
      }
      li a:hover {
        text-decoration: underline;
      }
      li a:focus-visible {
        outline: 2px solid var(--subnet-link, currentColor);
        outline-offset: 2px;
        border-radius: 2px;
      }
      small {
        display: block;
        font-size: 0.8em;
        opacity: 0.6;
      }
      nav {
        display: flex;
        gap: 1rem;
        font-size: 0.85em;
        margin-top: 0.5rem;
      }
      nav a {
        color: var(--subnet-link, inherit);
        text-decoration: none;
      }
      nav a:hover {
        text-decoration: underline;
      }
      nav a:focus-visible {
        outline: 2px solid var(--subnet-link, currentColor);
        outline-offset: 2px;
        border-radius: 2px;
      }
    `;
    root.appendChild(style);

    const wrapper = document.createElement("section");

    if (display === "feed" || display === "both") {
      const heading = document.createElement("h2");
      heading.textContent = "From Around My Subnets";
      wrapper.appendChild(heading);

      const currentHost = window.location.hostname;
      const filtered = allEntries.filter((e) => {
        try {
          return new URL(e.link).hostname !== currentHost;
        } catch {
          return true;
        }
      });

      const list = document.createElement("ul");
      const shown = filtered.slice(0, maxCount);
      for (const entry of shown) {
        const li = document.createElement("li");

        const link = document.createElement("a");
        link.setAttribute("href", entry.link);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
        link.textContent = entry.title;
        li.appendChild(link);

        const meta = document.createElement("small");
        const parts = [];
        if (entry.author) parts.push(entry.author);
        if (entry.subnet) parts.push(entry.subnet);
        if (entry.published) {
          try {
            const d = new Date(entry.published);
            const time = document.createElement("time");
            time.setAttribute("datetime", entry.published);
            time.textContent = d.toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "numeric",
            });
            // Build meta: "Author · Subnet · <time>"
            if (parts.length > 0) {
              meta.textContent = parts.join(" \u00b7 ") + " \u00b7 ";
            }
            meta.appendChild(time);
          } catch {
            meta.textContent = parts.join(" \u00b7 ");
          }
        } else {
          meta.textContent = parts.join(" \u00b7 ");
        }

        li.appendChild(meta);
        list.appendChild(li);
      }
      wrapper.appendChild(list);
    }

    if (display === "nav" || display === "both") {
      const nav = document.createElement("nav");
      for (const s of subnetMeta) {
        const a = document.createElement("a");
        a.setAttribute("href", s.link);
        a.textContent = s.title;
        nav.appendChild(a);
      }
      wrapper.appendChild(nav);
    }

    root.appendChild(wrapper);
  }

  async _fetchFeed(feedUrl, hubUrl) {
    const cacheKey = "subnet:" + hubUrl;
    const TTL = 1000 * 60 * 30; // 30 minutes

    // Try cache first
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() - cached.ts < TTL) {
        return cached.data;
      }
    } catch {
      // ignore cache errors
    }

    // Fetch live
    try {
      const res = await fetch(feedUrl);
      if (!res.ok) return this._loadCache(cacheKey);
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, "application/xml");

      if (doc.querySelector("parsererror")) return this._loadCache(cacheKey);

      const feed = doc.querySelector("feed");
      const meta = {
        title: feed ? (feed.querySelector("title")?.textContent || "") : "",
        link: hubUrl,
      };

      const entries = [];
      for (const el of doc.querySelectorAll("entry")) {
        const title = el.querySelector("title")?.textContent || "";
        const linkEl = el.querySelector('link[rel="alternate"]') || el.querySelector("link");
        const link = linkEl ? linkEl.getAttribute("href") : "";
        const published =
          el.querySelector("published")?.textContent ||
          el.querySelector("updated")?.textContent ||
          "";
        const author = el.querySelector("author > name")?.textContent || "";
        const subnet = el.querySelector("category")?.getAttribute("term") || meta.title;

        if (title && link) {
          entries.push({ title, link, published, author, subnet });
        }
      }

      const data = { meta, entries };
      this._saveCache(cacheKey, data);
      return data;
    } catch {
      return this._loadCache(cacheKey);
    }
  }

  _loadCache(key) {
    try {
      const cached = JSON.parse(localStorage.getItem(key));
      if (cached) return cached.data;
    } catch {
      // ignore
    }
    return null;
  }

  _saveCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
      // ignore quota errors
    }
  }
}

customElements.define("subnet-widget", SubnetWidget);
