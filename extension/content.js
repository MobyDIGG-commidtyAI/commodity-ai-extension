/* A single isolated, dismissible price receipt; all decisions come from API v2. */
(() => {
  "use strict";
  const P = globalThis.CAIParse;
  if (!P || window.top !== window) return;
  const version = chrome.runtime.getManifest?.().version || "unknown";
  let host, timer, stopped = false, lastKey = null, lastHref = location.href, seq = 0, dismissedHref = null;
  const money = (v) => v == null ? "Unavailable" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(v);
  const date = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown";
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    for (const child of children) if (child != null) node.append(child);
    return node;
  }
  // Theme: Commodity AI black/white/blue. Dark card so the verdict reads as the one thing to remember on a white shop page.
  const style = [
    ":host{all:initial}.receipt{box-sizing:border-box;width:min(320px,calc(100vw - 32px));color:#C9D3E3;border:1px solid #1E2A44;border-radius:18px;font:400 13px/1.5 'CAI Prompt',system-ui,sans-serif;font-variant-numeric:tabular-nums;text-align:left;padding:16px 18px 18px;position:relative;overflow:hidden;",
    "background:radial-gradient(circle at 100% 0%,rgba(47,107,255,.40) 0%,rgba(47,107,255,.10) 34%,rgba(10,16,32,0) 60%),repeating-linear-gradient(0deg,rgba(91,147,255,.07) 0 1px,transparent 1px 32px),repeating-linear-gradient(90deg,rgba(91,147,255,.07) 0 1px,transparent 1px 32px),linear-gradient(160deg,#0A1020 55%,#13234D);",
    "box-shadow:0 24px 60px -18px rgba(7,11,20,.6),inset 0 1px 0 rgba(255,255,255,.06)}",
    "*{box-sizing:border-box}::selection{background:#2F6BFF;color:#fff}a{color:inherit;text-decoration:none;display:block}a:focus-visible,button:focus-visible{outline:2px solid #5B93FF;outline-offset:3px}",
    ".brand{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.18em;font-weight:600;color:#F5F8FD;padding-right:28px}.brand:before{content:'';width:8px;height:8px;border-radius:2px;background:#2F6BFF;box-shadow:0 2px 8px rgba(47,107,255,.6)}",
    ".product{margin:6px 0 0;color:#A3AEC2;overflow-wrap:anywhere}.verdict{font-size:22px;line-height:1.15;font-weight:600;letter-spacing:-.02em;color:#F5F8FD;margin:8px 0 10px}.below{color:#5B93FF}.above{color:#FF8A80}",
    ".note{font-size:11px;color:#A3AEC2;margin-top:7px}.rows{border-top:1px solid #24304A;padding-top:10px;display:grid;grid-template-columns:1fr auto;gap:5px 10px;margin:10px 0}.rows dt{color:#A3AEC2}.rows dd{margin:0;text-align:right;color:#F5F8FD;font-weight:600;max-width:170px}",
    ".signal{border-top:1px solid #24304A;margin-top:9px;padding-top:9px;color:#F5F8FD}.signal strong{display:block;font-size:10px;color:#8DB5FF;font-weight:600;letter-spacing:.12em;text-transform:uppercase}",
    ".cta{display:inline-block;margin-top:14px;padding:8px 14px;border-radius:999px;background:#2F6BFF;color:#fff;font-weight:600;box-shadow:0 8px 20px -8px rgba(47,107,255,.8);transition:background-color .2s cubic-bezier(.16,1,.3,1)}.cta:hover{background:#1F4FD8}",
    ".close{position:absolute;top:8px;right:8px;border:0;background:transparent;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#A3AEC2;cursor:pointer}.close:hover{background:rgba(255,255,255,.06);color:#F5F8FD}.close svg{width:14px;height:14px}",
    ".status{font-size:13px;margin:10px 0 4px;color:#C9D3E3}.retry{font:inherit;font-weight:600;padding:7px 14px;cursor:pointer;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);color:#F5F8FD}.retry:hover{border-color:#5B93FF}"
  ].join("");
  // Prompt (OFL) from the extension package; the shadow root uses fonts registered on the document.
  let fontsRequested = false;
  function loadFonts() {
    if (fontsRequested) return;
    fontsRequested = true;
    try {
      if (typeof FontFace === "undefined" || !document.fonts || !chrome.runtime.getURL) return;
      const ranges = { latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212", thai: "U+0E01-0E5B,U+200C-200D,U+25CC" };
      for (const weight of ["400", "600"]) for (const subset of ["latin", "thai"]) {
        fetch(chrome.runtime.getURL(`fonts/prompt-${weight}-${subset}.woff2`)).then(r => r.arrayBuffer())
          .then(buf => document.fonts.add(new FontFace("CAI Prompt", buf, { weight, unicodeRange: ranges[subset] }))).catch(() => {});
      }
    } catch (_) { /* system font fallback */ }
  }
  // News pressure from the daily judge (context only, not a forecast); shown when the API has a scored item.
  function newsSignal(n) {
    if (!n || n.status !== "SCORED") return null;
    const label = n.direction === "UP" ? "Upward pressure" : n.direction === "DOWN" ? "Downward pressure" : "No clear pressure";
    const score = (n.pressure > 0 ? "+" : "") + Number(n.pressure).toFixed(2);
    return el("div", {class:"signal"}, el("strong", null, "News pressure · " + (n.category === "GPU" ? "GPU" : "DDR5")),
      label + " (" + score + ")");
  }
    function closeIcon() {
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), path = document.createElementNS(NS, "path");
    for (const [k, v] of [["viewBox", "0 0 14 14"], ["aria-hidden", "true"], ["fill", "none"]]) svg.setAttribute(k, v);
    for (const [k, v] of [["d", "M2 2l10 10M12 2L2 12"], ["stroke", "currentColor"], ["stroke-width", "1.8"], ["stroke-linecap", "round"]]) path.setAttribute(k, v);
    svg.append(path);
    return svg;
  }
  function remove() { if (host) host.remove(); host = null; }
  function mount(nodes) {
    if (dismissedHref === location.href) return;
    remove();
    host = document.createElement("cai-price-badge");
    for (const [k,v] of [["position","fixed"],["top","16px"],["right","16px"],["z-index","2147483647"],["display","block"]]) host.style.setProperty(k,v,"important");
    const shadow = host.attachShadow({mode:"closed"});
    loadFonts();
    const close = el("button", {class:"close",type:"button","aria-label":"Close price check"}, closeIcon());
    close.addEventListener("click", () => { dismissedHref = location.href; remove(); });
    shadow.append(el("style",null,style), el("section",{class:"receipt","aria-label":"Commodity AI price check","aria-live":"polite"},el("div",{class:"brand"},"COMMODITY AI · v"+version),...nodes,close));
    document.documentElement.append(host);
  }
  function showStatus(message, retry=false) {
    const nodes=[el("p",{class:"status"},message)];
    if (retry) {
      const button=el("button",{class:"retry",type:"button"},"Retry");
      button.addEventListener("click",()=>{lastKey=null;schedule(0);});
      nodes.push(button);
    }
    mount(nodes);
  }
  function render(d,base,title) {
    const p=d.product, a=d.price_assessment, e=d.evidence, o=d.outlook;
    const name=p.model || ((p.generation || p.interface) + " · " + p.capacity_gb + " GB");
    const url=new URL(base.replace(/\/+$/,"") + d.dashboard);
    url.searchParams.set("from",location.href.split("#")[0]);
    url.searchParams.set("title",title.slice(0,500));
    const range=a.low_thb!=null && a.high_thb!=null ? money(a.low_thb)+"–"+money(a.high_thb) : "Not enough evidence";
    const body=el("a",{href:url.href,target:"_blank",rel:"noopener noreferrer"},
      el("div",{class:"product"},name),
      el("div",{class:"verdict "+(a.listing_thb==null?"pending":a.status)},a.listing_thb==null?(d.product_match?.needs_confirmation?"Confirm option and price":"Fetching listing price…"):a.label),
      el("dl",{class:"rows"},el("dt",null,"Your price"),el("dd",null,money(a.listing_thb)),el("dt",null,"Reference range"),el("dd",null,range)),
      el("div",{class:"note"},a.basis),
      d.product_match?.selection_note ? el("div",{class:"note"},d.product_match.selection_note) : null,
      a.diff_pct!=null ? el("div",{class:"note"},Math.abs(a.diff_pct).toFixed(1)+"% "+(a.diff_pct<0?"below":"above")+" reference midpoint") : el("div",{class:"note"},a.reason),
      el("div",{class:"signal"},el("strong",null,"Buying timing"),d.seasonality.label),
      el("div",{class:"signal"},el("strong",null,"Next 90 days · "+(o.status==="validated_forecast"?"Forecast":o.status==="scenario"?"Scenario":"Unavailable")),o.label),
      newsSignal(d.news_judge),
      el("div",{class:"note"},"Observed: "+date(e.last_observed_date)+" · Confidence: "+(e.confidence || "none")),
      e.stale ? el("div",{class:"note"},"Older reference — historical comparison only") : null,
      a.provisional ? el("div",{class:"note"},a.warnings?.join(" ")||"Provisional comparison; check the product option.") : null,
      el("span",{class:"cta"},"View price breakdown"));
    body.addEventListener("click",(event)=>{
      event.preventDefault();
      chrome.runtime.sendMessage({type:"open",url:url.href},(r)=>{
        if (chrome.runtime.lastError || !r || !r.ok) window.open(url.href,"_blank","noopener");
      });
    });
    mount([body]);
  }
  function stop() { stopped=true; observer.disconnect();clearInterval(poll);clearTimeout(timer); }
  function check() {
    timer=null;
    if(stopped)return;
    try {if(!chrome.runtime.id){showStatus("Extension updated. Refresh this product page.");return stop();}}catch(_){showStatus("Extension updated. Refresh this product page.");return stop();}
    const listing=P.extractListing(document);
    if(!listing.title || !P.parseTitle(listing.title)){if(lastKey!==null){lastKey=null;seq++;remove();}return;}
    const selection=P.shopSelection?.(document,listing.title);
    if(selection?.choose){seq++;lastKey=null;showStatus("Selecting the first available option…");selection.choose.click();schedule(600);return;}
    if(selection?.local_price){listing.price=selection.price;listing.source.price="selected_option_price";}
    const warnings=P.listingWarnings(document,listing.title);
    if(selection?.local_price)warnings.ambiguous=selection.price_range||selection.unresolved;
    else if(selection?.label)warnings.ambiguous=true;
    const key=[location.href,listing.title,listing.price,warnings.ambiguous,selection?.label,selection?.canonical].join("|");
    if(key===lastKey)return;
    lastKey=key;
    const mine=++seq, href=location.href;
    showStatus("Fetching price data…");
    try {
      chrome.runtime.sendMessage({type:"verdict",title:listing.title,price:listing.price,ambiguous:warnings.ambiguous,title_source:listing.source.title,price_source:listing.source.price,
        variant_title:selection?.label&&!selection.unresolved?selection.canonical:null,variant_label:selection?.label||null},(resp)=>{
        if(mine!==seq || href!==location.href)return;
        if(chrome.runtime.lastError || !resp || !resp.ok){showStatus("Price service unavailable. Check the API address in extension Settings, then retry.",true);return;}
        if(!resp.data || !resp.data.covered){remove();return;}
        render(resp.data,resp.apiBase,listing.title);
      });
    }catch(_){showStatus("Extension connection lost. Refresh this page.",false);stop();}
  }
  function schedule(delay=600){if(!stopped && timer==null)timer=setTimeout(check,delay);}
  const observer=new MutationObserver((changes)=>{
    // Ignore this extension's own host insertion/removal.
    if(changes.every(c=>[...c.addedNodes,...c.removedNodes].length && [...c.addedNodes,...c.removedNodes].every(n=>n.nodeName==="CAI-PRICE-BADGE")))return;
    schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["content","class","aria-selected","aria-pressed","aria-disabled"]});
  const poll=setInterval(()=>{
    // Marketplace hydration can remove our host without changing the URL.
    if(host && host.isConnected===false && dismissedHref!==location.href){host=null;lastKey=null;schedule(0);}
    if(location.href===lastHref)return;
    lastHref=location.href;lastKey=null;seq++;remove();schedule(150);
  },1000);
  schedule(0);
})();
