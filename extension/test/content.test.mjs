import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function harness(selection=null) {
  class Element {
    constructor(tag) { this.tag=tag;this.children=[];this.attrs={};this.events={};this.style={setProperty(){}}; }
    setAttribute(k,v){this.attrs[k]=v;}
    append(...children){this.children.push(...children);}
    attachShadow(){this.shadow=new Element("shadow");return this.shadow;}
    addEventListener(k,f){this.events[k]=f;}
    remove(){this.removed=true;}
    get text(){return this.children.map(c=>typeof c==="string"?c:c.text).join(" ");}
  }
  const requests=[],tasks=[],intervals=[],hosts=[];
  let listing={title:"RAM DDR4 16GB",price:2000,source:{title:"h1",price:"json-ld"}};
  const location={href:"https://shopee.co.th/item-a"};
  const doc={createElement(tag){const e=new Element(tag);if(tag==="cai-price-badge")hosts.push(e);return e;},createElementNS(ns,tag){return new Element(tag);},documentElement:new Element("html")};
  const win={top:null,open(){}};win.top=win;
  const ctx={window:win,location,document:doc,URL,Intl,Date,console,
    CAIParse:{extractListing:()=>({...listing,source:{...listing.source}}),parseTitle:()=>({category:"RAM"}),listingWarnings:()=>({ambiguous:false}),shopSelection:()=>selection},
    chrome:{runtime:{id:"test",lastError:null,getManifest:()=>({version:"0.2.2"}),sendMessage(msg,cb){requests.push({msg,cb});}}},
    setTimeout(f){tasks.push(f);return tasks.length;},clearTimeout(){},
    setInterval(f){intervals.push(f);return intervals.length;},clearInterval(){},
    MutationObserver:class {constructor(f){this.f=f;}observe(){}disconnect(){}},
  };
  vm.runInNewContext(readFileSync(new URL("../content.js",import.meta.url),"utf8"),ctx);
  return {requests,hosts,location,poll(){intervals[0]();},flush(){while(tasks.length)tasks.shift()();},
    navigate(href){location.href=href;intervals[0]();},setListing(v){listing={...listing,...v};},setSelection(v){selection=v;}};
}

function reply() {
  return {ok:true,apiBase:"http://localhost:8000",data:{
    covered:true,product:{category:"RAM",generation:"DDR4",capacity_gb:16},dashboard:"/dashboard?title=DDR4",
    price_assessment:{status:"within",label:"Within reference range",listing_thb:2000,low_thb:1800,high_thb:2200,basis:"US reference converted to THB",reason:"Reference",diff_pct:0},
    evidence:{last_observed_date:"2026-10-16",confidence:"medium"},seasonality:{label:"No clear seasonal pattern"},
    outlook:{status:"scenario",label:"Broadly stable"},
  }};
}

test("badge uses API assessment and extraction provenance",()=>{
  const h=harness();h.flush();
  assert.equal(h.requests[0].msg.title_source,"h1");
  h.requests[0].cb(reply());
  assert.match(h.hosts.at(-1).shadow.text,/Within reference range/);
  assert.match(h.hosts.at(-1).shadow.text,/US reference converted to THB/);
  assert.match(h.hosts.at(-1).shadow.text,/Scenario/);
  assert.match(h.hosts.at(-1).shadow.text,/v0.2.2/);
});
test("pending requests show fetching, not an insufficient-data verdict",()=>{
  const h=harness();h.flush();
  assert.match(h.hosts.at(-1).shadow.text,/Fetching price data/);
  assert.doesNotMatch(h.hosts.at(-1).shadow.text,/Insufficient data/);
});
test("selected option and local price replace generic title-price pairing",()=>{
  const h=harness({label:"32GB(16GBx2)",canonical:"DDR5 32GB",price:22700,local_price:true,unresolved:false});h.flush();
  assert.equal(h.requests[0].msg.variant_title,"DDR5 32GB");
  assert.equal(h.requests[0].msg.variant_label,"32GB(16GBx2)");
  assert.equal(h.requests[0].msg.price,22700);
  assert.equal(h.requests[0].msg.price_source,"selected_option_price");
});
test("first available option is clicked before any assessment request",()=>{
  let clicks=0;
  const h=harness({choose:{click(){clicks++;h.setSelection({label:"500GB",canonical:"SATA SSD 500GB",price:4950,local_price:true});}}});
  h.flush();assert.equal(clicks,1);assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].msg.variant_title,"SATA SSD 500GB");
});
test("a missing shop price remains pending until the page supplies it",()=>{
  const h=harness();h.setListing({price:null});h.flush();
  const r=reply();Object.assign(r.data.price_assessment,{listing_thb:null,label:"Insufficient data",status:"insufficient"});
  h.requests[0].cb(r);
  assert.match(h.hosts.at(-1).shadow.text,/Fetching listing price/);
  assert.doesNotMatch(h.hosts.at(-1).shadow.text,/Insufficient data/);
  h.setListing({price:2000});h.navigate("https://shopee.co.th/item-a?variant=first");h.flush();
  h.requests[1].cb(reply());
  assert.match(h.hosts.at(-1).shadow.text,/Within reference range/);
});
test("badge is restored after marketplace hydration removes its host",()=>{
  const h=harness();h.flush();h.requests[0].cb(reply());
  h.hosts.at(-1).isConnected=false;h.poll();h.flush();
  assert.equal(h.requests.length,2);
  h.requests[1].cb(reply());
  assert.match(h.hosts.at(-1).shadow.text,/Within reference/);
});
test("late replies cannot replace a different product page",()=>{
  const h=harness();h.flush();const first=h.requests[0];
  h.navigate("https://shopee.co.th/item-b");h.setListing({title:"RAM DDR5 32GB",price:3000});h.flush();
  const count=h.hosts.length;first.cb(reply());
  assert.equal(h.hosts.length,count);
  h.requests[1].cb(reply());
  assert.match(h.hosts.at(-1).shadow.text,/Within reference/);
});
test("API failure replaces stale result with retry state",()=>{
  const h=harness();h.flush();h.requests[0].cb({ok:false,error:"timeout"});
  assert.match(h.hosts.at(-1).shadow.text,/Price service unavailable/);
  assert.match(h.hosts.at(-1).shadow.text,/Retry/);
});
test("dismissal persists on the same product page",()=>{
  const h=harness();h.flush();h.requests[0].cb(reply());
  const host=h.hosts.at(-1),section=host.shadow.children[1];
  section.children.at(-1).events.click();
  assert.equal(host.removed,true);
  const count=h.hosts.length;h.requests[0].cb(reply());
  assert.equal(h.hosts.length,count);
});
