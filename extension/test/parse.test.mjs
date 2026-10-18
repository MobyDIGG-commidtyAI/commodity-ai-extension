// node --test extension/test/
import test from "node:test";
import assert from "node:assert/strict";
import parse from "../parse.js";

const { parseTitle, extractListing, parsePrice } = parse;

// ---- parseTitle: same cases as tests/test_product.py --------------------------------------------

const RAM = [
  ["SOM Connect 16GB|32GB DDR4 3200MHz RAM PC ZADAK TWIST CL16 ของแท้ 32GB (16GB x 2)", "DDR4", 32],
  ["Corsair Ram PC DDR4 16GB-32GB/3200MHz CL16 Vengeance RGB RT (White) by Banana IT 16GB (2x8GB)", "DDR4", 16],
  ["KINGSTON RAM DDR5(6000) 32GB (16GBX2) FURY BEAST RGB (KF560C40BBAK2-32) 32GB (2x16GB)", "DDR5", 32],
  ["Kingston Fury Beast DDR5 Noir 5200MHz 128GB Kit (4x32GB) CL40", "DDR5", 128],
  ["SOM Connect 8GB|16GB DDR4 3200MHz RAM ZADAK SPARK ของแท้ 8GB", "DDR4", 8],
  ["แรม G.Skill Trident Z5 RGB DDR5 6000 64GB", "DDR5", 64],
];
for (const [title, gen, gb] of RAM) {
  test(`RAM: ${title}`, () => {
    assert.deepEqual(parseTitle(title), { category: "RAM", generation: gen, capacity_gb: gb });
  });
}

const GPU = [
  ["TVBESTBUY การ์ดจอ GALAX VGA GTX 1630 EX (1-Click OC) 4GB GDDR6 64-bit by Banana IT", "GTX 1630"],
  ["ASUS VGA TUF-GTX1660TI-O6G-EVO-GAMING 6GB GDDR6 192-bit", "GTX 1660 TI"],
  ["การ์ดจอ Sapphire Pulse Radeon RX 6600 XT 8GB GDDR6", "RX 6600 XT"],
  ["MSI GeForce RTX 5090 32G SUPRIM", "RTX 5090"],
];
for (const [title, model] of GPU) {
  test(`GPU: ${title}`, () => {
    assert.deepEqual(parseTitle(title), { category: "GPU", model });
  });
}

for (const title of ["Samsung SSD M.2 2TB", "เสื้อยืด cotton 100%", "Notebook ASUS Vivobook 16GB DDR5", "Mini PC board LPDDR5 16GB onboard", ""]) {
  test(`not covered: ${JSON.stringify(title)}`, () => {
    assert.equal(parseTitle(title), null);
  });
}

for (const [title, expected] of [
  ["Samsung 990 PRO NVMe SSD 2TB", { category: "SSD", interface: "NVME", capacity_gb: 2000 }],
  ["Crucial MX500 SATA SSD 500GB", { category: "SSD", interface: "SATA", capacity_gb: 500 }],
  ["M.2 SATA SSD 1TB", { category: "SSD", interface: "SATA", capacity_gb: 1000 }],
  ["PCIe SSD 1.5TB", { category: "SSD", interface: "NVME", capacity_gb: 1500 }],
  ["RTX 4070 Ti Super 16GB", { category: "GPU", model: "RTX 4070 TI SUPER" }],
]) test("v2 product: " + title, () => assert.deepEqual(parseTitle(title), expected));

test("price ranges and variant lists require confirmation", () => {
  const doc = fakeDocument('<body><h1>DDR4 16GB/32GB RAM</h1><p>฿1,000 - ฿2,000</p></body>');
  assert.equal(parse.listingWarnings(doc, "DDR4 16GB/32GB RAM").ambiguous, true);
});

test("non-string titles are not covered", () => {
  for (const t of [null, undefined, 42, {}]) assert.equal(parseTitle(t), null);
});

test("reported Shopee NVMe page remains covered without an advertised price", () => {
  const title="แล็ปท็อป SSD 1tb เฉพาะผู้ช่วยชีวิตคอมพิวเตอร์ Xiaoxin โปรโตคอล NVME M.2 pcie3.0ความเร็วสูง";
  const doc=fakeDocument(`<title>${title} | Shopee Thailand</title><body><h1>${title}</h1></body>`);
  const listing=extractListing(doc);
  assert.deepEqual(parseTitle(listing.title),{category:"SSD",interface:"NVME",capacity_gb:1000});
  assert.equal(listing.price,null);
});

test("Shopee Mall space-separated SSD capacities use automatic selection", () => {
  const title="WD Blue SA510 SATA SSD M.2 2280 250GB 500GB 1TB 2TB";
  const doc=fakeDocument(`<title>${title} | Shopee Thailand</title><body><h1>${title}</h1></body>`);
  assert.equal(parseTitle(extractListing(doc).title).interface,"SATA");
  assert.equal(parse.listingWarnings(doc,title).ambiguous,false);
  assert.equal(parse.listingWarnings(doc,title).capacity_options,true);
});

// Python's \b / \d are Unicode-aware; the port must agree (checked against product.py)
test("Unicode word boundaries and digits behave like Python re", () => {
  assert.equal(parseTitle("DDR5 32GBแรม"), null);              // Thai letter right after GB: no \b
  assert.equal(parseTitle("การ์ดจอRTX 4070"), null);             // Thai letter right before RTX: no \b
  assert.deepEqual(parseTitle("DDR5 ๓๒GB"), { category: "RAM", generation: "DDR5", capacity_gb: 32 });
  assert.deepEqual(parseTitle("DDR4 16 GB x 2"), { category: "RAM", generation: "DDR4", capacity_gb: 32 });
  assert.deepEqual(parseTitle("RTX4070Ti 12GB"), { category: "GPU", model: "RTX 4070 TI" });
});

test("parsePrice", () => {
  assert.equal(parsePrice("฿12,345"), 12345);
  assert.equal(parsePrice("1290.50"), 1290.5);
  assert.equal(parsePrice(15900), 15900);
  assert.equal(parsePrice("0"), null);
  assert.equal(parsePrice("ฟรี"), null);
  assert.equal(parsePrice(NaN), null);
});

// ---- extractListing on HTML fixtures ------------------------------------------------------------
// No DOM library (no npm deps): a tiny fake Document that supports exactly the calls extractListing
// makes: querySelector / querySelectorAll with `tag`, `[attr="v"]`, `tag[attr="v"]`; .title; .body.innerText.

const VOID = new Set(["meta", "link", "img", "br", "input", "hr"]);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

function fakeDocument(html) {
  const els = [];
  const tagRe = /<([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    }
    let inner = "";
    if (!VOID.has(tag)) {
      const end = html.indexOf(`</${tag}>`, tagRe.lastIndex);
      inner = end >= 0 ? html.slice(tagRe.lastIndex, end) : "";
    }
    const textContent = tag === "script" ? inner : decode(inner.replace(/<[^>]*>/g, ""));
    els.push({ tag, attrs, textContent, getAttribute: (n) => (n in attrs ? attrs[n] : null) });
  }
  const matcher = (sel) => {
    const s = sel.match(/^([a-z0-9]*)(?:\[([\w:-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/i);
    if (!s) throw new Error("fake DOM: unsupported selector " + sel);
    const [, tag, attr, val] = s;
    return (e) => (!tag || e.tag === tag.toLowerCase()) && (!attr || (attr in e.attrs && (val === undefined || e.attrs[attr] === val)));
  };
  const bodyHtml = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ""])[1];
  const bodyText = decode(bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "));
  const titleEl = els.find((e) => e.tag === "title");
  return {
    title: titleEl ? titleEl.textContent : "",
    body: { innerText: bodyText, textContent: bodyText },
    querySelector: (sel) => els.find(matcher(sel)) || null,
    querySelectorAll: (sel) => els.filter(matcher(sel)),
  };
}

const page = ({ head = "", body = "" }) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test("og:title + JSON-LD offers.price (Product inside @graph)", () => {
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [] },
    { "@type": "Product", name: "ignored, og wins", offers: { "@type": "Offer", price: "15900.00", priceCurrency: "THB" } },
  ] };
  const doc = fakeDocument(page({
    head: `<title>x</title><meta property="og:title" content="KINGSTON RAM DDR5(6000) 32GB (16GBX2) FURY BEAST RGB | Shopee Thailand">
           <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    body: `<h1>something else</h1><div>฿99</div>`,
  }));
  const r = extractListing(doc);
  assert.equal(r.title, "KINGSTON RAM DDR5(6000) 32GB (16GBX2) FURY BEAST RGB");
  assert.equal(r.price, 15900);
  assert.deepEqual(r.source, { title: "og:title", price: "json-ld" });
});

test("JSON-LD AggregateOffer lowPrice, offers as an array, malformed block skipped", () => {
  const ld = [{ "@type": ["Product"], name: "Corsair Vengeance DDR4 16GB (2x8GB) 3200MHz",
    offers: [{ "@type": "AggregateOffer", lowPrice: 1290, highPrice: 2590 }] }];
  const doc = fakeDocument(page({
    head: `<script type="application/ld+json">{not json</script><script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  }));
  const r = extractListing(doc);
  assert.equal(r.title, "Corsair Vengeance DDR4 16GB (2x8GB) 3200MHz");
  assert.equal(r.price, 1290);
  assert.deepEqual(r.source, { title: "json-ld", price: "json-ld" });
});

test("[itemprop=price] content beats product:price:amount meta", () => {
  const doc = fakeDocument(page({
    head: `<meta property="og:title" content="แรม G.Skill Trident Z5 RGB DDR5 6000 64GB"><meta property="product:price:amount" content="9999">`,
    body: `<span itemprop="price" content="7,490">฿7,490</span>`,
  }));
  assert.deepEqual(extractListing(doc), { title: "แรม G.Skill Trident Z5 RGB DDR5 6000 64GB", price: 7490, source: { title: "og:title", price: "itemprop" } });
});

test("product:price:amount meta when nothing structured", () => {
  const doc = fakeDocument(page({ head: `<meta property="og:title" content="DDR4 8GB 3200"><meta property="product:price:amount" content="590.00">` }));
  assert.equal(extractListing(doc).price, 590);
});

test("visible-text fallback: first ฿ price after the title, not the one before it", () => {
  const title = "SOM Connect 8GB|16GB DDR4 3200MHz RAM ZADAK SPARK ของแท้ 8GB";
  const doc = fakeDocument(page({
    head: `<title>${title} | Shopee Thailand</title>`,
    body: `<nav>โค้ดส่วนลด ฿50</nav><main><h1>${title}</h1>
           <div><span>4.9</span><span>ขายแล้ว 1.2พัน</span></div>
           <div class="price"><span>฿1,590</span> <s>฿2,190</s></div></main>`,
  }));
  const r = extractListing(doc);
  assert.equal(r.title, title);
  assert.equal(r.price, 1590);
  assert.deepEqual(r.source, { title: "h1", price: "text" });
});

test("title candidates: the first one the classifier covers wins over an earlier generic one", () => {
  const doc = fakeDocument(page({
    head: `<meta property="og:title" content="Lazada.co.th">`,
    body: `<h1 class="pdp-mod-product-badge-title">การ์ดจอ Sapphire Pulse Radeon RX 6600 XT 8GB GDDR6</h1><span>฿ 8,990</span>`,
  }));
  const r = extractListing(doc);
  assert.equal(r.title, "การ์ดจอ Sapphire Pulse Radeon RX 6600 XT 8GB GDDR6");
  assert.equal(r.price, 8990);
  assert.deepEqual(parseTitle(r.title), { category: "GPU", model: "RX 6600 XT" });
});

test("non-product page: title but nothing covered and no price", () => {
  const doc = fakeDocument(page({ head: `<title>Shopee Thailand | ช้อปออนไลน์</title>`, body: `<h1>ลดราคา</h1>` }));
  const r = extractListing(doc);
  assert.equal(parseTitle(r.title), null);
  assert.equal(r.price, null);
});

test("empty document", () => {
  assert.deepEqual(extractListing(fakeDocument("")), { title: null, price: null, source: { title: null, price: null } });
});

test("long titles are cut to the API's 500-char limit", () => {
  const long = "DDR5 32GB " + "x".repeat(800);
  const doc = fakeDocument(page({ head: `<meta property="og:title" content="${long}">` }));
  assert.equal(extractListing(doc).title.length, 500);
});
