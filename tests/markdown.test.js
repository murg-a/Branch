import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdown,previewPlan,headingEdit} from '../src/markdown-plan.js';
const plan=(text,pos=text.length)=>previewPlan(text,parseMarkdown(text).tree,[{from:pos,to:pos}]);
const visible=(text,p)=>{let out=text;for(const r of [...p.hidden,...p.replacements].sort((a,b)=>b.from-a.from))out=out.slice(0,r.from)+(r.text||'')+out.slice(r.to);return out;};
test('five heading levels have distinct styles and reveal only the active heading',()=>{
 const text=Array.from({length:5},(_,i)=>'#'.repeat(i+1)+' Titolo '+(i+1)).join('\n\n')+'\n\nFine';
 const p=plan(text);for(let i=1;i<=5;i++)assert(p.lines.some(l=>l.classes.includes('md-heading-'+i)));
 assert(!visible(text,p).includes('#'));assert(visible(text,plan(text,3)).startsWith('# Titolo 1'));
});
test('inline Markdown hides outside the active paragraph without changing source',()=>{
 const text='**Forte** e _corsivo_ e ~~taglio~~ e <u>linea</u> [sito](https://example.com)\n\nAttivo';
 assert.equal(visible(text,plan(text)),'Forte e corsivo e taglio e linea sito\n\nAttivo');
 assert.equal(visible(text,plan(text,4)),text);
});
test('literal code and escaped formatting remain literal',()=>{
 const text='`**letterale**` e \\*stella\\*\n\n```js\n# **codice**\n```\n\nFine';
 const output=visible(text,plan(text));assert(output.includes('**letterale**'));assert(output.includes('# **codice**'));assert(output.includes('*stella*'));
});
test('nested lists and continuation lines use the content indentation',()=>{
 const text='- Primo punto\n  continuazione\n  - Sotto punto\n\n10. Numero\n    seguito\n\nFine';
 const p=plan(text);const list=p.lines.filter(l=>l.list).map(l=>l.list);
 assert.equal(list[0].indent,2);assert.equal(list[1].indent,2);assert.equal(list[2].indent,4);assert.equal(list[3].indent,4);assert.equal(list[4].indent,4);
 assert(p.replacements.some(r=>r.kind==='list'&&r.text==='10.'));
 const active=plan(text,3);assert(!active.replacements.some(r=>r.from===0));
});
test('heading selector edits only the prefix and preserves caret',()=>{
 for(let i=1;i<=5;i++){const edit=headingEdit('Testo',3,i);assert.equal(edit.insert,'#'.repeat(i)+' ');assert.equal(edit.to,0);assert.equal(edit.anchor,3+i+1);}
 assert.deepEqual(headingEdit('### Titolo',7,0),{from:0,to:4,insert:'',anchor:3});
 assert.equal(headingEdit('    codice',6,2),null);assert.equal(headingEdit('Testo',3,6),null);
});
test('incremental parse matches fresh Markdown after insertion',()=>{
 const before='**Testo**\n\nFine',after='### **Testo**\n\nFine';
 const parsed=parseMarkdown(after,parseMarkdown(before),[{fromA:0,toA:0,fromB:0,toB:4}]);
 assert.deepEqual(previewPlan(after,parsed.tree),previewPlan(after,parseMarkdown(after).tree));
});
