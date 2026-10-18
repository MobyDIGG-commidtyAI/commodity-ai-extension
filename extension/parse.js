/* Listing title -> product, and page -> {title, price}. Pure functions, no chrome.* APIs.
 *
 * parseTitle is a port of src/cai/product.py parse_title (keep the two in step). Python's str
 * regexes are Unicode-aware: \b and \w treat Thai letters as word characters, \d matches any decimal
 * digit (Thai ๐-๙ included) and int() reads them, \s is Unicode whitespace. JS \b, \d and \s are not
 * the same, so the patterns below spell those classes out to match CPython's behaviour.
 *
 * Loaded as a content script (exports on globalThis.CAIParse) and by node --test (module.exports).
 */
(function (root) {
  "use strict";

  // CPython sre: word char = str.isalnum() or "_"; \d = category Nd; \s = str.isspace()
  const W = "[\\p{L}\\p{N}_]";
  const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
  const S = "[\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
  const D = "\\p{Nd}";

  const GPU_RE = new RegExp(
    `${B}(RTX|GTX)${S}*-?${S}*(${D}{4})${S}*(TI${S}*SUPER|TI|SUPER)?${B}|${B}RX${S}*-?${S}*(${D}{3,4})${S}*(XTX|XT)?${B}`, "iu");
  const GPU_HINT_RE = new RegExp(`การ์ดจอ|graphics card|${B}VGA${B}|GDDR${D}|geforce|radeon`, "iu");
  // skips GDDR5 (GPU memory) and LPDDR5 (soldered)
  const RAM_GEN_RE = new RegExp(`(?<!G)(?<!LP)DDR${S}*([45])(?!${D})`, "iu");
  const RAM_SKIP_RE = new RegExp(
    `${B}(notebook|laptop|ssd|nvme|motherboard|mainboard|cpu|usb|flash ?drive|case)${B}|โน้ตบุ๊ค|เมนบอร์ด`, "iu");
  // "16GB-32GB" / "8GB|16GB" option lists
  const RANGE_RE = new RegExp(`${D}{1,3}${S}*GB${S}*[-|/]${S}*(?=${D}{1,3}${S}*GB)`, "giu");
  const KIT_RE = new RegExp(
    `(${D})${S}*[x×]${S}*(${D}{1,3})${S}*GB|(${D}{1,3})${S}*GB${S}*[x×]${S}*(${D})`, "giu");
  const GB_RE = new RegExp(`(?<![x×${D}])(${D}{1,3})${S}*GB${B}`, "giu");
  const VALID_GB = new Set([4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256]);

  const ND_RE = /^\p{Nd}$/u;

  // Value of one Unicode decimal digit. Nd digits are encoded in runs of ten starting at 0,
  // so the value is the number of Nd code points directly before it, mod 10.
  function digitValue(ch) {
    const cp = ch.codePointAt(0);
    if (cp >= 48 && cp <= 57) return cp - 48;
    let k = 0;
    while (cp - k - 1 >= 0 && ND_RE.test(String.fromCodePoint(cp - k - 1))) k++;
    return k % 10;
  }

  // int() on a run of Unicode decimal digits
  function toInt(digits) {
    let n = 0;
    for (const ch of digits) n = n * 10 + digitValue(ch);
    return n;
  }

  function ramCapacity(title) {
    const t = title.replace(RANGE_RE, " ");
    const kits = [...t.matchAll(KIT_RE)]
      .map(([, a, b, c, d]) => (a ? toInt(a) * toInt(b) : toInt(c) * toInt(d)))
      .filter((k) => VALID_GB.has(k));
    if (kits.length) return kits[kits.length - 1];
    const gbs = [...t.matchAll(GB_RE)].map((m) => toInt(m[1])).filter((g) => VALID_GB.has(g));
    return gbs.length ? gbs[gbs.length - 1] : null;
  }

  /** -> {category: "RAM", generation: "DDR5", capacity_gb: 32}
   *   | {category: "GPU", model: "RTX 4070 TI"} | null (not something the model covers). */
  function parseTitle(title) {
    if (typeof title !== "string" || !title) return null;
    const g = GPU_RE.exec(title);
    if (g && (GPU_HINT_RE.test(title) || !RAM_GEN_RE.test(title))) {
      let model;
      if (g[1]) model = `${g[1].toUpperCase()} ${g[2]}` + (g[3] ? ` ${g[3].toUpperCase().replace(/\s+/g, " ").replace("TISUPER", "TI SUPER")}` : "");
      else model = `RX ${g[4]}` + (g[5] ? ` ${g[5].toUpperCase()}` : "");
      return { category: "GPU", model };
    }
    if (/\b(ssd|nvme|sata)\b/i.test(title) && !/\b(enclosure|external|portable|usb|laptop|notebook|prebuilt|bundle|combo|motherboard)\b/i.test(title)) {
      const nvme = /\b(nvme|pcie|pci-e)\b/i.test(title);
      const sata = /\bsata\b/i.test(title);
      const caps = [...title.matchAll(/(\d+(?:\.\d+)?)\s*(TB|GB)\b/gi)]
        .map(([, n, u]) => Number(n) * (u.toUpperCase() === "TB" ? 1000 : 1))
        .filter((n) => Number.isInteger(n) && n >= 120 && n <= 16000);
      if (caps.length && nvme !== sata) return { category: "SSD", interface: nvme ? "NVME" : "SATA", capacity_gb: caps[caps.length - 1] };
    }
    const m = RAM_GEN_RE.exec(title);
    if (m && !RAM_SKIP_RE.test(title) && !GPU_HINT_RE.test(title)) {
      const cap = ramCapacity(title);
      if (cap) return { category: "RAM", generation: `DDR${m[1]}`, capacity_gb: cap };
    }
    return null;
  }

  // ---- page extraction ------------------------------------------------------------------------

  const MAX_TITLE = 500; // the API rejects longer titles (Query max_length=500)
  const PRICE_TEXT_RE = /฿\s*(\d[\d,]*(?:\.\d+)?)/;
  const SHOP_SUFFIX_RE = /\s*[|\-–—]\s*(?:Shopee|Lazada)[^|\-–—]*$/i;
  const NEAR_TITLE_CHARS = 1500;

  function cleanTitle(s) {
    if (typeof s !== "string") return null;
    const t = s.replace(/\s+/g, " ").trim().replace(SHOP_SUFFIX_RE, "").trim();
    return t ? t.slice(0, MAX_TITLE) : null;
  }

  /** "฿12,345.00" / "12345" / 12345 -> 12345; anything not a positive finite number -> null */
  function parsePrice(v) {
    if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
    if (typeof v !== "string") return null;
    const m = v.match(/\d[\d,]*(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function attr(el, name) {
    return el && typeof el.getAttribute === "function" ? el.getAttribute(name) : null;
  }

  function isProductNode(n) {
    const t = n && n["@type"];
    return Array.isArray(t) ? t.includes("Product") : t === "Product";
  }

  // every Product node in the page's JSON-LD blocks (top level, arrays, @graph)
  function jsonLdProducts(doc) {
    const out = [];
    const visit = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(visit);
      if (isProductNode(n)) out.push(n);
      if (n["@graph"]) visit(n["@graph"]);
    };
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try { visit(JSON.parse(s.textContent || "")); } catch (_) { /* malformed block: skip */ }
    }
    return out;
  }

  function offerPrice(offers) {
    const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
    for (const key of ["price", "lowPrice"]) {
      for (const o of list) {
        if (!o || typeof o !== "object") continue;
        const p = parsePrice(o[key]) ?? (key === "price" ? parsePrice(o.priceSpecification?.price) : null);
        if (p) return p;
      }
    }
    return null;
  }

  function priceFromText(raw, title) {
    if (!raw) return null;
    const text = raw.replace(/\s+/g, " ");
    if (title) {
      const i = text.indexOf(title.slice(0, 60));
      if (i >= 0) {
        const m = text.slice(i, i + title.length + NEAR_TITLE_CHARS).match(PRICE_TEXT_RE);
        if (m) return parsePrice(m[1]);
      }
    }
    const m = text.match(PRICE_TEXT_RE);
    return m ? parsePrice(m[1]) : null;
  }

  /** Reads the listing title and price from a product page.
   * `doc` is a Document, or any object with querySelector / querySelectorAll / title / body.innerText.
   * Title candidates: og:title, JSON-LD Product name, first <h1>, document.title; the first one
   * parseTitle() covers wins, else the first non-empty one.
   * Price: JSON-LD offers.price / offers.lowPrice, [itemprop=price], product:price:amount meta,
   * then the first "฿12,345" after the title in the visible text (or anywhere if the title isn't found).
   * -> {title, price, source: {title, price}} with null for anything not found. */
  function extractListing(doc) {
    const products = jsonLdProducts(doc);
    const h1 = doc.querySelector("h1");
    const titles = [
      ["og:title", cleanTitle(attr(doc.querySelector('meta[property="og:title"]'), "content"))],
      ["json-ld", cleanTitle(products.map((p) => p.name).find((n) => typeof n === "string"))],
      ["h1", cleanTitle(h1 && h1.textContent)],
      ["document.title", cleanTitle(doc.title)],
    ].filter(([, t]) => t);
    const [titleSource, title] = titles.find(([, t]) => parseTitle(t)) || titles[0] || [null, null];

    const ip = doc.querySelector('[itemprop="price"]');
    const bodyText = () => (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    const prices = [
      ["json-ld", () => products.map((p) => offerPrice(p.offers)).find((p) => p)],
      ["itemprop", () => parsePrice(attr(ip, "content")) ?? parsePrice(ip && ip.textContent)],
      ["meta", () => parsePrice(attr(doc.querySelector('meta[property="product:price:amount"]'), "content"))],
      ["text", () => priceFromText(bodyText(), title)],
    ];
    let price = null;
    let priceSource = null;
    for (const [src, get] of prices) {
      const p = get();
      if (p) { price = p; priceSource = src; break; }
    }
    return { title: title || null, price, source: { title: titleSource, price: priceSource } };
  }

  function listingWarnings(doc, title) {
    const body = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    const range = /฿\s*[\d,]+(?:\.\d+)?\s*[-–~]\s*฿?\s*[\d,]+/.test(body);
    const multiple = /\d+\s*(?:GB|TB)\s*[-|/]\s*\d+\s*(?:GB|TB)/i.test(title || "");
    const parsed = parseTitle(title);
    const ssdCapacities = parsed?.category === "SSD" ? new Set([...title.matchAll(/(\d+(?:\.\d+)?)\s*(TB|GB)\b/gi)].map(([,n,u])=>Number(n)*(u.toUpperCase()==="TB"?1000:1))) : new Set();
    const aggregate = jsonLdProducts(doc).some((p) => {
      const offers = Array.isArray(p.offers) ? p.offers : [p.offers];
      return offers.some((o) => o && parsePrice(o.lowPrice) && parsePrice(o.highPrice) && parsePrice(o.lowPrice) !== parsePrice(o.highPrice));
    });
    const h1 = doc.querySelector("h1");
    const current = h1 && parseTitle(cleanTitle(h1.textContent));
    const previous = parseTitle(title);
    const conflict = current && previous && JSON.stringify(current) !== JSON.stringify(previous);
    const identityConflict = conflict && (current.category !== previous.category || current.model !== previous.model || current.generation !== previous.generation || current.interface !== previous.interface);
    return { ambiguous: Boolean(range || aggregate || identityConflict), capacity_options: Boolean(multiple || ssdCapacities.size>1), price_range: Boolean(range || aggregate) };
  }
  // Product-page option controls only; never infer capacity from a generic title range.
  function shopSelection(doc, title) {
    const controls = [...doc.querySelectorAll('button[class*="selection-box-"]')];
    const available = controls.filter(n => !n.disabled && attr(n,"aria-disabled") !== "true");
    const selected = available.filter(n => /(?:^|\s)selection-box-selected(?:\s|$)/.test(attr(n,"class") || ""));
    const missingGroup = available.find(n => !selected.some(s => s.parentElement === n.parentElement));
    if (missingGroup) return { choose: missingGroup, pending: true };
    const label = selected.map(n => (n.innerText || n.textContent || "").trim()).join(" · ");
    let canonical = title, unresolved = false;
    if (label) {
      const base = parseTitle(title);
      if (base?.category === "RAM") {
        const cap = ramCapacity(label);
        const generations = [...title.matchAll(/(?<!G)(?<!LP)DDR\s*([45])/gi)].map(m=>m[1]);
        let gen = /DDR\s*([45])/i.exec(label)?.[1] || (new Set(generations).size === 1 ? generations[0] : null);
        // Descriptions sometimes explicitly map each option to a generation.
        if (!gen) {
          const paragraphs = [...doc.querySelectorAll('p')].map(n=>(n.innerText||n.textContent||"").trim());
          const start = paragraphs.findIndex(t => t === "ความจุ " + label);
          if (start >= 0) {
            const block = [];
            for (const t of paragraphs.slice(start+1)) { if (/^ความจุ\s/.test(t)) break; block.push(t); }
            const matches = [...block.join(" ").matchAll(/DDR\s*([45])/gi)].map(m=>m[1]);
            if (new Set(matches).size === 1) gen = matches[0];
          }
        }
        if (gen && cap) canonical = "RAM DDR" + gen + " " + cap + "GB";
        else unresolved = true;
      } else if (base?.category === "SSD") {
        const caps = [...label.matchAll(/(\d+(?:\.\d+)?)\s*(TB|GB)\b/gi)].map(([,n,u])=>Number(n)*(u.toUpperCase()==="TB"?1000:1));
        const sku = /\bWDS(\d+)(G|T)3B0[AB]\b/i.exec(label);
        const capacity = caps.length === 1 ? caps[0] : sku ? Number(sku[1])*(sku[2].toUpperCase()==="T"?10:1) : null;
        const iface = /\bsata\b/i.test(label) ? "SATA" : /\bnvme\b/i.test(label) ? "NVME" : base.interface;
        if (capacity && capacity >= 120) canonical = iface + " SSD " + capacity + "GB";
        else unresolved = true;
      } else if (base?.category === "GPU") {
        const option = parseTitle(label);
        if (option?.category === "GPU") canonical = label;
        else if (/\b(?:RTX|GTX|RX)\b/i.test(label)) unresolved = true;
      }
    }
    const local = doc.querySelector('.pyzxvq');
    const priceText = local && (local.innerText || local.textContent || "");
    const priceRange = Boolean(priceText && /[\d,]+\s*[-–~]\s*฿?\s*[\d,]+/.test(priceText));
    return {label, canonical, unresolved, price:priceText&&!priceRange?parsePrice(priceText):null,
      price_range:priceRange, local_price:Boolean(priceText), pending:false};
  }
  const api = { parseTitle, ramCapacity, extractListing, parsePrice, cleanTitle, listingWarnings, shopSelection };
  root.CAIParse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
