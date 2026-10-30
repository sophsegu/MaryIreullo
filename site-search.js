/* ==========================================================
   MARIA IERULLO WEBSITE — SITE-WIDE SEARCH
   Save this file as: site-search.js
   Load it on index.html, archive.html, gallery.html,
   and bibliography.html.
========================================================== */
(() => {
  "use strict";

  const PAGES = [
    { file: "index.html", label: "Home" },
    { file: "archive.html", label: "Historical Archive" },
    { file: "gallery.html", label: "Photo Gallery" },
    { file: "bibliography.html", label: "Bibliography & Sources" }
  ];

  const INTRO =
    "Search names, dates, places, stories, photographs, quotations and historical records.";

  const normalize = value => (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const slug = value => normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 65) || "item";

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  function pageFileFromLocation() {
    const last = location.pathname.split("/").filter(Boolean).pop();
    return last || "index.html";
  }

  function isCurrentPage(file) {
    const current = pageFileFromLocation();
    return current === file || (current === "" && file === "index.html");
  }

  function addStableIds(doc, file) {
    const selectors = file === "archive.html"
      ? [".archive-entry"]
      : file === "bibliography.html"
        ? [".source-item"]
        : file === "gallery.html"
          ? [".photo-card"]
          : [".story-card", ".timeline-card", ".gallery-item", ".archive-card"];

    selectors.forEach(selector => {
      [...doc.querySelectorAll(selector)].forEach((element, index) => {
        if (element.id) return;
        const title = element.querySelector("h1,h2,h3,h4,.entry-title")?.textContent
          || element.textContent;
        const prefix = selector.replace(/^\./, "").replace(/[^a-z0-9]+/gi, "-");
        element.id = `${prefix}-${index + 1}-${slug(title)}`;
      });
    });

    // Gallery cards are generated from the photos array by gallery.html's
    // inline script. Give the live cards stable IDs based on their filenames.
    if (file === "gallery.html") {
      [...doc.querySelectorAll(".photo-card")].forEach(card => {
        const image = card.querySelector("img");
        const filename = image?.getAttribute("src")?.split("/").pop();
        if (filename) card.id = `photo-${slug(filename.replace(/\.[^.]+$/, ""))}`;
      });
    }
  }

  function extractGalleryPhotoRecords(doc) {
    const records = [];
    doc.querySelectorAll("script").forEach(script => {
      const source = script.textContent || "";
      if (!source.includes("const photos")) return;

      const objectPattern = /\{\s*file\s*:\s*["']([^"']+)["']\s*,\s*description\s*:\s*["']((?:\\.|[^"'\\])*)["']\s*\}/gs;
      let match;
      while ((match = objectPattern.exec(source)) !== null) {
        const filename = match[1];
        const description = match[2].replace(/\\(["'\\])/g, "$1");
        records.push({
          title: filename,
          text: `${filename} ${description}`,
          excerpt: description,
          href: `gallery.html#photo-${slug(filename.replace(/\.[^.]+$/, ""))}`,
          label: "Photo Gallery"
        });
      }
    });
    return records;
  }

  function textOf(element) {
    return (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function makeRecord(element, file, label, index) {
    const heading = element.querySelector("h1,h2,h3,h4,.entry-title,.source-link");
    const title = (heading?.textContent || element.getAttribute("data-title")
      || textOf(element).slice(0, 95)).trim();
    const text = [
      textOf(element),
      element.getAttribute("data-search") || "",
      element.getAttribute("data-tags") || "",
      element.getAttribute("data-category") || ""
    ].join(" ");

    if (!element.id) {
      const prefix = file === "archive.html" ? "archive-entry"
        : file === "bibliography.html" ? "source-item"
        : element.className.toString().split(/\s+/)[0] || "content";
      element.id = `${prefix}-${index + 1}-${slug(title)}`;
    }

    return {
      title: title.slice(0, 120),
      text,
      excerpt: text.slice(0, 260),
      href: `${file}#${encodeURIComponent(element.id)}`,
      label
    };
  }

  function collectRecords(doc, page) {
    addStableIds(doc, page.file);

    if (page.file === "gallery.html") {
      return extractGalleryPhotoRecords(doc);
    }

    const records = [];
    const seen = new Set();
    const selectors = page.file === "archive.html"
      ? [".archive-entry"]
      : page.file === "bibliography.html"
        ? [".source-item"]
        : [
            ".story-card", ".timeline-card", ".gallery-item",
            ".archive-card", ".searchable", "article"
          ];

    selectors.forEach(selector => {
      [...doc.querySelectorAll(selector)].forEach((element, index) => {
        if (element.closest("nav,footer,script,style")) return;
        if (seen.has(element)) return;
        seen.add(element);
        const record = makeRecord(element, page.file, page.label, index);
        if (normalize(record.text)) records.push(record);
      });
    });

    // Also index standalone sections and paragraphs on the home page so
    // introductory text, quotations and poetry remain searchable.
    if (page.file === "index.html") {
      [...doc.querySelectorAll("main section[id], body > section[id]")].forEach(section => {
        if (section.closest("nav,footer")) return;
        if ([...section.querySelectorAll("article,.story-card,.timeline-card,.gallery-item,.archive-card")].length) return;
        const record = makeRecord(section, page.file, page.label, records.length);
        if (normalize(record.text)) records.push(record);
      });
    }

    return records;
  }

  let pageCache = null;
  let searchSequence = 0;

  async function loadIndex() {
    if (pageCache) return pageCache;

    pageCache = Promise.all(PAGES.map(async page => {
      try {
        let doc;
        if (isCurrentPage(page.file)) {
          doc = document;
        } else {
          const response = await fetch(page.file, { cache: "no-cache" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          doc = new DOMParser().parseFromString(html, "text/html");
        }
        return collectRecords(doc, page);
      } catch (error) {
        console.warn(`Site search could not load ${page.file}:`, error);
        return [];
      }
    })).then(groups => groups.flat());

    return pageCache;
  }

  function scoreRecord(record, query, tokens) {
    const haystack = normalize(record.text);
    if (!tokens.every(token => haystack.includes(token))) return 0;
    let score = 1;
    if (haystack.includes(query)) score += 8;
    if (normalize(record.title).includes(query)) score += 12;
    tokens.forEach(token => {
      if (normalize(record.title).includes(token)) score += 3;
    });
    return score;
  }

  function renderResults(container, records, rawQuery) {
    container.replaceChildren();

    if (!records.length) {
      const message = document.createElement("p");
      message.className = "site-search-message";
      message.textContent = `No results found for “${rawQuery}”. Try a different name, date, place or subject.`;
      container.appendChild(message);
      return;
    }

    const heading = document.createElement("p");
    heading.className = "site-search-summary";
    heading.textContent = `${records.length} result${records.length === 1 ? "" : "s"} for “${rawQuery}”`;
    container.appendChild(heading);

    records.slice(0, 30).forEach(record => {
      const item = document.createElement("article");
      item.className = "site-search-result";

      const link = document.createElement("a");
      link.className = "site-search-result-title";
      link.href = record.href;
      link.textContent = record.title;

      const excerpt = document.createElement("p");
      excerpt.textContent = record.excerpt.length > 230
        ? `${record.excerpt.slice(0, 227)}…`
        : record.excerpt;

      const source = document.createElement("small");
      source.textContent = record.label;

      item.append(link, excerpt, source);
      container.appendChild(item);
    });

    if (records.length > 30) {
      const note = document.createElement("p");
      note.className = "site-search-message";
      note.textContent = "Showing the first 30 results. Add another word to narrow your search.";
      container.appendChild(note);
    }
  }

  async function runSearch(input, output) {
    const sequence = ++searchSequence;
    const rawQuery = input.value.trim();
    const query = normalize(rawQuery);
    output.replaceChildren();

    if (!query) {
      const message = document.createElement("p");
      message.className = "site-search-message";
      message.textContent = INTRO;
      output.appendChild(message);
      return;
    }

    const loading = document.createElement("p");
    loading.className = "site-search-message";
    loading.textContent = "Searching all pages…";
    output.appendChild(loading);

    const index = await loadIndex();
    if (sequence !== searchSequence) return;

    const tokens = query.split(" ").filter(Boolean);
    const matches = index
      .map(record => ({ ...record, score: scoreRecord(record, query, tokens) }))
      .filter(record => record.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    renderResults(output, matches, rawQuery);
  }

  function injectStyles() {
    if (document.getElementById("site-search-styles")) return;
    const style = document.createElement("style");
    style.id = "site-search-styles";
    style.textContent = `
      .site-search-result {
        padding: 15px 17px; margin: 10px 0;
        background: rgba(255,255,255,.09);
        border: 1px solid rgba(255,255,255,.22);
        text-align: left;
      }
      .site-search-result-title {
        color: #fff !important; display: inline-block;
        font: 600 21px/1.25 "Cormorant Garamond",serif;
        text-decoration: underline; text-decoration-color: #d8bd83;
        text-underline-offset: 4px;
      }
      .site-search-result p { color: inherit; margin: 7px 0 0; font-size: 13px; }
      .site-search-result small {
        display: block; margin-top: 7px; color: #d8bd83;
        font: 10px "DM Mono",monospace; letter-spacing: 1px;
        text-transform: uppercase;
      }
      .site-search-message,.site-search-summary { margin: 12px 0; font-size: 13px; }
      .site-search-panel {
        position: fixed; z-index: 5000; right: 22px; bottom: 22px;
        width: min(560px, calc(100vw - 28px)); max-height: min(76vh, 720px);
        overflow: auto; padding: 22px; background: #641f2b; color: #fff;
        border: 1px solid #b08a4a; box-shadow: 0 15px 50px rgba(0,0,0,.28);
        display: none;
      }
      .site-search-panel.is-open { display: block; }
      .site-search-panel h2 {
        font: 500 30px/1.1 "Cormorant Garamond",serif; margin: 0 0 14px;
      }
      .site-search-panel form { display: flex; gap: 7px; }
      .site-search-panel input {
        min-width: 0; flex: 1; padding: 12px;
        border: 1px solid #ded4c6; background: #fff; color: #24211f;
      }
      .site-search-panel button {
        border: 0; padding: 10px 14px; cursor: pointer;
        background: #24211f; color: #fff; font: 11px "DM Mono",monospace;
      }
      .site-search-toggle {
        position: fixed; z-index: 4999; right: 22px; bottom: 22px;
        border: 1px solid #b08a4a; background: #641f2b; color: white;
        padding: 13px 18px; cursor: pointer;
        font: 11px "DM Mono",monospace; letter-spacing: .8px;
        text-transform: uppercase; box-shadow: 0 5px 20px rgba(0,0,0,.18);
      }
      .site-search-panel.is-open + .site-search-toggle { display: none; }
      @media(max-width:600px) {
        .site-search-panel { right: 10px; bottom: 10px; width: calc(100vw - 20px); padding: 16px; }
        .site-search-toggle { right: 12px; bottom: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function connectExistingHomeSearch() {
    let input = document.getElementById("siteSearch");
    let clear = document.getElementById("clearSearch");
    const output = document.getElementById("searchResult");
    if (!input || !output) return false;

    // Detach listeners from the older home-page search implementation,
    // if it is still present in index.html.
    const freshInput = input.cloneNode(true);
    input.replaceWith(freshInput);
    input = freshInput;
    if (clear) {
      const freshClear = clear.cloneNode(true);
      clear.replaceWith(freshClear);
      clear = freshClear;
    }

    output.textContent = INTRO;
    input.addEventListener("input", () => runSearch(input, output));
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        input.value = "";
        searchSequence++;
        output.textContent = INTRO;
      }
    });
    clear?.addEventListener("click", () => {
      input.value = "";
      searchSequence++;
      output.textContent = INTRO;
      input.focus();
    });
    return true;
  }

  function addFloatingSearch() {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "site-search-toggle";
    toggle.textContent = "Search this site";
    toggle.setAttribute("aria-expanded", "false");

    const panel = document.createElement("section");
    panel.className = "site-search-panel";
    panel.setAttribute("aria-label", "Search the entire website");
    panel.innerHTML = `
      <h2>Search Maria's Story</h2>
      <form role="search">
        <input type="search" aria-label="Search the entire website"
          placeholder="Name, year, place, subject…" autocomplete="off">
        <button type="submit">Search</button>
        <button type="button" data-clear>Clear</button>
      </form>
      <div class="site-search-output" aria-live="polite"></div>
    `;

    const form = panel.querySelector("form");
    const input = panel.querySelector("input");
    const output = panel.querySelector(".site-search-output");
    const clear = panel.querySelector("[data-clear]");

    output.textContent = INTRO;
    form.addEventListener("submit", event => {
      event.preventDefault();
      runSearch(input, output);
    });
    input.addEventListener("input", () => runSearch(input, output));
    clear.addEventListener("click", () => {
      input.value = "";
      searchSequence++;
      output.textContent = INTRO;
      input.focus();
    });
    toggle.addEventListener("click", () => {
      panel.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      input.focus();
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => {
      panel.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
    form.appendChild(close);

    document.body.append(panel, toggle);
  }

  function revealTargetFromHash() {
    if (!location.hash) return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); }
    catch { id = location.hash.slice(1); }

    const target = document.getElementById(id);
    if (!target) return;

    // Ensure the destination is visible if a page-specific filter was active.
    target.hidden = false;
    target.style.display = "";
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    addStableIds(document, pageFileFromLocation());
    const hasHomeSearch = connectExistingHomeSearch();
    if (!hasHomeSearch) addFloatingSearch();

    if (location.hash) {
      requestAnimationFrame(revealTargetFromHash);
    }
    window.addEventListener("hashchange", revealTargetFromHash);
  });
})();