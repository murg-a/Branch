import test from 'node:test';
import assert from 'node:assert/strict';
import {ChangeSet} from '@codemirror/state';
import * as M from '../src/model.js';
const attach=(b)=>{b.L=[{id:'v1',text:'alternativa'}];b.notes=[{id:'n1',text:'nota'}];return b;};
function reconcileEdit(text,blocks,change){const cs=ChangeSet.of(change,text.length),next=text.slice(0,change.from)+(change.insert||'')+text.slice(change.to??change.from);return M.reconcile(blocks,next,(p,a)=>cs.mapPos(p,a));}
test('parses blank-separated paragraphs while preserving code blocks and exact offsets',()=>{const text='# Titolo\n\n😀 testo\n\n```md\n\n# codice\n```\n';const blocks=M.fromMarkdown(text);assert.equal(blocks.length,3);assert.equal(blocks[2].text,'```md\n\n# codice\n```');for(const b of blocks)assert.equal(text.slice(b.start,b.end),b.text);});
test('parking a paragraph leaves an identified empty slot and preserves notes',()=>{const blocks=M.fromMarkdown('uno\n\ndue');attach(blocks[0]);const result=M.park(blocks,blocks[0].id,'R');assert.equal(result.blocks[0].id,blocks[0].id);assert.equal(result.blocks[0].text,'');assert.equal(result.blocks[0].R[0].text,'uno');assert.equal(result.blocks[0].notes[0].text,'nota');assert.equal(blocks[0].text,'uno');});
test('promoting a variant swaps instead of discarding the prior trunk',()=>{const blocks=M.fromMarkdown('uno');attach(blocks[0]);const result=M.promote(blocks,blocks[0].id,'L','v1');assert.equal(result.text,'alternativa');assert.equal(result.blocks[0].L[0].text,'uno');const restored=M.promote(result.blocks,blocks[0].id,'L','v1');assert.equal(restored.text,'uno');});
test('promotion into empty slot consumes the chosen variant',()=>{let result=M.park(M.fromMarkdown('uno'),'missing','R');assert.equal(result,null);const blocks=M.fromMarkdown('uno');result=M.park(blocks,blocks[0].id,'R');result=M.promote(result.blocks,blocks[0].id,'R',result.blocks[0].R[0].id);assert.equal(result.text,'uno');assert.equal(result.blocks[0].R.length,0);});
test('typing into an empty parked slot keeps notes and variants attached',()=>{const blocks=M.fromMarkdown('uno\n\ndue'),parked=M.park(blocks,blocks[0].id,'L');const next=reconcileEdit(parked.text,parked.blocks,{from:0,insert:'nuovo'});assert.equal(next[0].id,blocks[0].id);assert.equal(next[0].L[0].text,'uno');assert.equal(next[0].text,'nuovo');assert.equal(next[1].id,blocks[1].id);});
test('editing a paragraph preserves its stable identity',()=>{const text='uno\n\ndue',blocks=M.fromMarkdown(text);attach(blocks[1]);const next=reconcileEdit(text,blocks,{from:5,to:8,insert:'secondo 😀'});assert.equal(next[1].id,blocks[1].id);assert.deepEqual(next[1].notes,blocks[1].notes);});
test('splitting a paragraph keeps attachments once on the first part',()=>{const text='uno due',blocks=M.fromMarkdown(text);attach(blocks[0]);const next=reconcileEdit(text,blocks,{from:3,insert:'\n\n'});assert.equal(next.length,2);assert.equal(next[0].id,blocks[0].id);assert.equal(next[0].L.length,1);assert.equal(next[1].L.length,0);});
test('merging paragraphs conserves both sets of notes and alternatives',()=>{const text='uno\n\ndue',blocks=M.fromMarkdown(text);attach(blocks[0]);blocks[1].R=[{id:'v2',text:'due alternativo'}];blocks[1].notes=[{id:'n2',text:'seconda nota'}];const next=reconcileEdit(text,blocks,{from:3,to:5,insert:' '});assert.equal(next.length,1);assert.equal(next[0].notes.length,2);assert.equal(next[0].R[0].text,'due alternativo');});
test('deleting an annotated paragraph archives it without assigning its notes to a neighbor',()=>{const text='uno\n\ndue',blocks=M.fromMarkdown(text);attach(blocks[0]);const next=reconcileEdit(text,blocks,{from:0,to:5,insert:''});const archived=next.find(b=>b.detached);assert.equal(archived.id,blocks[0].id);assert.equal(archived.notes[0].text,'nota');assert.equal(next.find(b=>!b.detached).notes.length,0);});
test('moving a heading moves its whole subtree and all attachments',()=>{const blocks=M.fromMarkdown('# A\n\nuno\n\n## Figlio\n\ndue\n\n# B\n\ntre');attach(blocks[1]);const ids=M.sectionIds(blocks,blocks[0].id);assert.equal(ids.length,4);const result=M.move(blocks,{id:blocks[0].id,zone:'T'},blocks.at(-1).id,'after');assert.deepEqual(result.blocks.map(b=>b.id),[blocks[4].id,blocks[5].id,...ids]);assert.equal(result.blocks.find(b=>b.id===blocks[1].id).notes[0].text,'nota');assert.equal(M.move(blocks,{id:blocks[0].id,zone:'T'},blocks[1].id,'after'),null);});
test('a section cannot be parked as one variant',()=>{const blocks=M.fromMarkdown('# A\n\nuno');assert.equal(M.move(blocks,{id:blocks[0].id,zone:'T'},blocks[1].id,'L'),null);});
test('moving a variant onto occupied text inserts a new paragraph without overwriting it',()=>{const blocks=M.fromMarkdown('uno\n\ndue');attach(blocks[0]);const result=M.move(blocks,{id:blocks[0].id,zone:'L',variantId:'v1'},blocks[1].id,'before');assert.equal(result.blocks.length,3);assert.equal(result.blocks[1].text,'alternativa');assert.equal(result.blocks[2].text,'due');assert.equal(result.blocks[0].L.length,0);});
test('full backup round trip preserves exact Markdown, IDs, variants, notes and empty slots',()=>{const base=M.fromMarkdown('uno\n\ndue');attach(base[0]);const result=M.park(base,base[1].id,'R');const doc={id:'doc',title:'Prova',...result};const imported=M.importBackup(M.backup(doc));assert.equal(imported.text,doc.text);assert.deepEqual(imported.blocks,doc.blocks);assert.notEqual(imported.id,doc.id);});
test('malformed backup is rejected instead of partially importing',()=>{assert.throws(()=>M.importBackup('{"format":"branch","version":3}'));const doc={title:'x',text:'uno',blocks:M.fromMarkdown('uno')};doc.blocks[0].start=2;assert.throws(()=>M.importBackup(M.backup(doc)));});
test('migration leaves the original Markdown untouched',()=>{const text='\n# Tasto\n\nUna riga\nseconda riga.\n';const doc=M.normalizeDocument({id:'old',title:'Prima',text,updated:1});assert.equal(doc.text,text);assert.equal(doc.blocks.length,2);assert.equal(doc.blocks[1].text,'Una riga\nseconda riga.');});

test('backup cannot silently omit source text',()=>{const doc={title:'x',text:'uno\n\ndue',blocks:M.fromMarkdown('uno')};assert.throws(()=>M.importBackup(M.backup(doc)));});

test('map hierarchy resolves nested sections, siblings and root paragraphs',()=>{
  const blocks=M.fromMarkdown('Introduzione\n\n# A\n\nTesto A\n\n### C\n\nTesto C\n\n## B\n\nTesto B\n\n# D');
  const rows=M.mapHierarchy(blocks);
  assert.deepEqual(rows.map(row=>row.ancestors.map(a=>a.level)),[[],[],[1],[1],[1,3],[1],[1,2],[]]);
  assert.equal(rows[4].ancestors[1].id,blocks[3].id);
});
test('Markdown without notes stays byte-for-byte identical',()=>{
  const text='\n# Titolo\n\nTesto.\n\n';assert.equal(M.markdownWithNotes({text,blocks:M.fromMarkdown(text)}),text);
});
test('Markdown appends multiline notes with references and never mutates editor source',()=>{
  const text='# Titolo\n\nUn paragrafo.',blocks=M.fromMarkdown(text);blocks[1].notes=[{id:'n1',text:'Prima riga.\n\nSecondo capoverso.'},{id:'n2',text:'Un’altra nota.'}];
  const doc={text,blocks},copy=structuredClone(doc),md=M.markdownWithNotes(doc);
  assert.ok(md.startsWith('# Titolo\n\nUn paragrafo.[^branch-1][^branch-2]'));
  assert.match(md,/## Note\n\n\[\^branch-1\]: Prima riga\.\n    \n    Secondo capoverso\./);
  assert.match(md,/\[\^branch-2\]: Un’altra nota\./);
  assert.deepEqual(doc,copy);
});
test('export references never corrupt fenced code or table rows',()=>{
  for(const text of ['```js\nconst n = 1;\n```','| A | B |\n| --- | --- |\n| 1 | 2 |']){
    const blocks=M.fromMarkdown(text);blocks[0].notes=[{id:'n',text:'Nota.'}];
    assert.ok(M.markdownWithNotes({text,blocks}).startsWith(text+'\n\n[^branch-1]'));
  }
});
test('existing footnote labels cannot collide with generated note references',()=>{
  const text='Un testo[^branch-1].\n\n[^branch-1]: Nota già scritta.',blocks=M.fromMarkdown(text);blocks[0].notes=[{id:'n',text:'Nuova nota.'}];
  const md=M.markdownWithNotes({text,blocks});assert.match(md,/\[\^branch-2\]: Nuova nota\./);assert.equal(md.split('[^branch-1]:').length-1,1);
});
test('notes from removed paragraphs are explicit in the Markdown appendix',()=>{
  const text='Testo attuale.',blocks=M.fromMarkdown(text),archived={...M.newBlock('Paragrafo eliminato'),detached:true,start:-1,end:-1,notes:[{id:'n',text:'Da conservare.'}]};
  const md=M.markdownWithNotes({text,blocks:[...blocks,archived]});assert.match(md,/### Paragrafi fuori dal testo\n\n- Paragrafo eliminato\[\^branch-1\]/);assert.match(md,/\[\^branch-1\]: Da conservare\./);
});

test('directional transfer exchanges trunk and selected branch without losing attachments',()=>{
  const blocks=M.fromMarkdown('Tronco');attach(blocks[0]);blocks[0].L.push({id:'v2',text:'Seconda variante'});
  const result=M.transfer(blocks,blocks[0].id,'L','v2');
  assert.equal(result.text,'Seconda variante');assert.equal(result.blocks[0].L[1].text,'Tronco');assert.equal(result.blocks[0].L[0].text,'alternativa');assert.deepEqual(result.blocks[0].notes,blocks[0].notes);assert.equal(result.blocks[0].id,blocks[0].id);
});
test('directional transfer parks on an empty side and fills an empty trunk on the reverse action',()=>{
  const blocks=M.fromMarkdown('Un testo'),parked=M.transfer(blocks,blocks[0].id,'R');
  assert.equal(parked.blocks[0].text,'');assert.equal(parked.blocks[0].R[0].text,'Un testo');
  const restored=M.transfer(parked.blocks,blocks[0].id,'R');assert.equal(restored.text,'Un testo');assert.equal(restored.blocks[0].R.length,0);
  assert.equal(M.transfer(M.fromMarkdown(''),'missing','L'),null);assert.equal(M.transfer(blocks,blocks[0].id,'invalid'),null);
});
test('formatting preserves Unicode selections and toggles wrappers around the selection',()=>{
  const bold=M.formatSelection('😀 caffè',3,8,'bold');assert.equal(bold.insert,'**caffè**');assert.equal(bold.anchor,5);assert.equal(bold.head,10);
  assert.deepEqual(M.formatSelection('**caffè**',2,7,'bold'),{from:0,to:9,insert:'caffè',anchor:0,head:5});
  assert.equal(M.formatSelection('_testo_',0,7,'italic').insert,'testo');
});
test('underline uses paired HTML tags and keeps the caret between them for an empty selection',()=>{
  const edit=M.formatSelection('abc',1,1,'underline');assert.equal(edit.insert,'<u></u>');assert.equal(edit.anchor,4);assert.equal(edit.head,4);
  assert.equal(M.formatSelection('<u>abc</u>',0,10,'underline').insert,'abc');
});
test('list formatting excludes the next line when a selection ends at its start',()=>{
  const edit=M.formatSelection('uno\ndue',0,4,'bullet');assert.equal(edit.from,0);assert.equal(edit.to,3);assert.equal(edit.insert,'- uno');
});
test('list formatting switches markers, preserves indentation and toggles selected lines',()=>{
  const source='  - uno\n  - due';const numbered=M.formatSelection(source,0,source.length,'number');assert.equal(numbered.insert,'  1. uno\n  2. due');
  const removed=M.formatSelection(numbered.insert,0,numbered.insert.length,'number');assert.equal(removed.insert,'  uno\n  due');
  assert.equal(M.formatSelection('\nabc',0,0,'bullet').insert,'- ');
});

test('formatting several paragraphs preserves each paragraph identity and its notes',()=>{
  const text='primo\n\nsecondo',blocks=M.fromMarkdown(text);blocks[0].notes=[{id:'a',text:'Nota uno'}];blocks[1].notes=[{id:'b',text:'Nota due'}];
  const edit=M.formatSelection(text,0,text.length,'number'),changes=ChangeSet.of(M.formatChanges(text,edit),text.length);
  const nextText='1. primo\n\n2. secondo',next=M.reconcile(blocks,nextText,(p,a)=>changes.mapPos(p,a));
  assert.equal(next[0].id,blocks[0].id);assert.equal(next[1].id,blocks[1].id);assert.deepEqual(next[0].notes,blocks[0].notes);assert.deepEqual(next[1].notes,blocks[1].notes);
});
test('minimal formatting edits produce the same result for each supported command',()=>{
  const text='uno\n\ndue';
  for(const command of ['bold','italic','underline','bullet','number']){
    const edit=M.formatSelection(text,0,text.length,command),changes=M.formatChanges(text,edit);
    let result=text;for(const change of [...changes].reverse())result=result.slice(0,change.from)+change.insert+result.slice(change.to);
    assert.equal(result,text.slice(0,edit.from)+edit.insert+text.slice(edit.to));
  }
});

test('headings cannot create branches through park, transfer or map drop',()=>{
  const blocks=M.fromMarkdown('# Titolo\n\nParagrafo');blocks[1].L=[{id:'variant',text:'Alternativa'}];
  assert.equal(M.canCreateBranches(blocks[0]),false);assert.equal(M.canCreateBranches(blocks[1]),true);
  assert.equal(M.park(blocks,blocks[0].id,'R'),null);assert.equal(M.transfer(blocks,blocks[0].id,'L'),null);
  assert.equal(M.move(blocks,{id:blocks[1].id,zone:'T'},blocks[0].id,'R'),null);
  assert.equal(M.move(blocks,{id:blocks[1].id,zone:'L',variantId:'variant'},blocks[0].id,'L'),null);
});
test('legacy heading variants stay in backups and can still be exchanged',()=>{
  const blocks=M.fromMarkdown('# Titolo');blocks[0].R=[{id:'old',text:'# Altro titolo'}];blocks[0].notes=[{id:'n',text:'Nota del titolo'}];
  const exchanged=M.transfer(blocks,blocks[0].id,'R');assert.equal(exchanged.text,'# Altro titolo');assert.equal(exchanged.blocks[0].R.length,1);assert.equal(exchanged.blocks[0].R[0].text,'# Titolo');assert.deepEqual(exchanged.blocks[0].notes,blocks[0].notes);
  const restored=M.importBackup(M.backup({title:'Vecchio documento',text:'# Titolo',blocks}));assert.deepEqual(restored.blocks,blocks);
});
