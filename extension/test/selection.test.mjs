import test from 'node:test';
import assert from 'node:assert/strict';
import parse from '../parse.js';

function page({labels=[],selected=[],disabled=[],title,price='฿4,950',paragraphs=[]}) {
  const group={};
  const buttons=labels.map((text,i)=>({parentElement:group,innerText:text,textContent:text,disabled:disabled.includes(i),
    getAttribute(k){return k==='class'?'selection-box-'+(selected.includes(i)?'selected':'unselected'):k==='aria-disabled'?String(disabled.includes(i)):null;}}));
  return {querySelectorAll(s){if(s==='p')return paragraphs.map(textContent=>({textContent}));return buttons;},
    querySelector(){return price?{textContent:price}:null;}};
}
test('select first enabled option, not the first capacity in the title',()=>{
  const d=page({labels:['250GB','500GB'],disabled:[0]});
  assert.equal(parse.shopSelection(d,'SATA SSD 250GB 500GB').choose.innerText,'500GB');
});
test('WD SKU is 500GB and product-area price is used',()=>{
  const d=page({labels:['WDS500G3B0B'],selected:[0]});
  const r=parse.shopSelection(d,'WD Blue SA510 SATA SSD 250GB 500GB 1TB');
  assert.equal(r.canonical,'SATA SSD 500GB');assert.equal(r.price,4950);
});
test('RAM description resolves DDR5 without double counting kit size',()=>{
  const d=page({labels:['32GB(16GBx2) 5200MHz'],selected:[0],paragraphs:['ความจุ 32GB(16GBx2) 5200MHz','ชื่อสินค้า: KINGSTON FURY BEAST DDR5','ความจุ 16GB(16GBx1) 3200MHz','DDR4']});
  assert.equal(parse.shopSelection(d,'KINGSTON DDR4/DDR5 RAM 16GB-32GB').canonical,'RAM DDR5 32GB');
});
test('price range never supplies a numeric variant price',()=>{
  const r=parse.shopSelection(page({labels:['1TB'],selected:[0],price:'฿1,471 - ฿5,183'}),'NVMe SSD 1TB');
  assert.equal(r.price,null);assert.equal(r.price_range,true);
});
test('ambiguous translated unit is not assumed to mean GB',()=>{
  const r=parse.shopSelection(page({labels:['128กรัม'],selected:[0]}),'NVMe SSD 1TB');
  assert.equal(r.unresolved,true);
});
test('changing selected capacity changes canonical identity',()=>{
  const d=page({labels:['500GB','1TB'],selected:[1]});
  assert.equal(parse.shopSelection(d,'NVMe SSD 500GB 1TB').canonical,'NVME SSD 1000GB');
});
