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
  const style = [
    ":host{all:initial}.receipt{box-sizing:border-box;width:min(310px,calc(100vw - 32px));background:#fbf9f4;color:#1f1d1a;border:1px solid #b9b2a5;border-radius:7px;box-shadow:0 12px 28px #15181c30;font:13px/1.5 system-ui,sans-serif;text-align:left;padding:16px;position:relative}",
    "*{box-sizing:border-box}a{color:inherit;text-decoration:none;display:block}a:focus-visible,button:focus-visible{outline:2px solid #1d4ed8;outline-offset:3px}.brand{font-size:10px;letter-spacing:.16em;font-weight:700;padding-right:25px}.product{margin:5px 0;color:#57524a;overflow-wrap:anywhere}.verdict{font-size:20px;line-height:1.2;font-weight:750;margin:9px 0}.below{color:#166534}.above{color:#9f1d1d}.note{font-size:11px;color:#57524a;margin-top:7px}.rows{border-top:1px dashed #b9b2a5;padding-top:9px;display:grid;grid-template-columns:1fr auto;gap:4px;margin:10px 0}.rows dt{color:#57524a}.rows dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;max-width:170px}.signal{border-top:1px dashed #b9b2a5;margin-top:8px;padding-top:8px}.signal strong{display:block;font-size:11px;color:#57524a;font-weight:500}.cta{display:block;margin-top:11px;text-decoration:underline;text-underline-offset:3px;font-weight:650}.close{position:absolute;top:4px;right:4px;border:0;background:transparent;width:32px;height:32px;font:22px system-ui;color:#57524a;cursor:pointer}.status{font-size:13px;margin:8px 0}.retry{font:inherit;padding:7px 12px;cursor:pointer}"
  ].join("");
  function remove() { if (host) host.remove(); host = null; }
  function mount(nodes) {
    if (dismissedHref === location.href) return;
    remove();
    host = document.createElement("cai-price-badge");
    for (const [k,v] of [["position","fixed"],["top","16px"],["right","16px"],["z-index","2147483647"],["display","block"]]) host.style.setProperty(k,v,"important");
    const shadow = host.attachShadow({mode:"closed"});
    const close = el("button", {class:"close",type:"button","aria-label":"Close price check"}, "×");
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
