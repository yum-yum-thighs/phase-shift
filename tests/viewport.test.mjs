import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldPoint} from '../viewport.mjs';
test('fullscreen letterboxing preserves world coordinates and rejects the bars',()=>{
  const rect={left:20,top:10,width:1000,height:800};
  assert.deepEqual(worldPoint(rect,1000,500,520,410,200),{x:700,y:250,inside:true});
  assert.equal(worldPoint(rect,1000,500,520,40).inside,false);
});
test('phone-sized scaling and scrolling camera preserve the selected particle',()=>{
  const p=worldPoint({left:14,top:100,width:380,height:340},760,680,204,270,320);
  assert.deepEqual(p,{x:700,y:340,inside:true});
});
