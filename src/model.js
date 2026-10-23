// Markdown is the canonical text; stable IDs attach alternatives and notes to blocks.
export const uid = () => crypto.randomUUID();
const clone = value => structuredClone(value);
export function parseBlocks(text) {
  const result=[];let start=null,offset=0,fence=null;
  for(const line of text.split(/(?<=\n)/)) {
    const body=line.replace(/\r?\n$/,'');
    const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(body);
    if(start===null&&body.trim())start=offset;
    if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;}
    if(!body.trim()&&!fence&&start!==null){let end=offset;while(end>start&&/[\r\n]/.test(text[end-1]))end--;result.push({start,end,text:text.slice(start,end)});start=null;}
    offset+=line.length;
  }
  if(start!==null){let end=text.length;while(end>start&&/[\r\n]/.test(text[end-1]))end--;result.push({start,end,text:text.slice(start,end)});}
  return result;
}
export const hasExtras=b=>b.L.length||b.R.length||b.notes.length;
export const level=b=>/^ {0,3}(#{1,6})\s/.exec(b.text)?.[1].length||0;
export const canCreateBranches=block=>!!block&&!block.detached&&level(block)===0;
export const label=b=>(b.text.replace(/^\s*#{1,6}\s+/,'').split('\n')[0]||'Paragrafo vuoto');
export function newBlock(text='',extras={}){return {id:uid(),text,L:[],R:[],notes:[],...extras};}
export function fromMarkdown(text){let blocks=parseBlocks(text).map(b=>({...newBlock(b.text),...b}));if(!blocks.length)blocks=[{...newBlock(),start:0,end:0}];return blocks;}
export function normalizeDocument(doc){
  const copy=clone(doc);copy.text=typeof copy.text==='string'?copy.text:'';
  if(!Array.isArray(copy.blocks))copy.blocks=fromMarkdown(copy.text);
  copy.blocks=copy.blocks.map(b=>({...b,L:(b.L||[]).map(v=>typeof v==='string'?{id:uid(),text:v}:v),R:(b.R||[]).map(v=>typeof v==='string'?{id:uid(),text:v}:v),notes:b.notes||[]}));
  return copy;
}
export function reconcile(oldBlocks,text,mapPos){
  const next=parseBlocks(text).map(b=>({...newBlock(b.text),...b}));const claimed=new Set();const detached=[];
  for(const old of oldBlocks){
    if(old.detached){detached.push(clone(old));continue;}
    const start=mapPos(old.start,-1),end=mapPos(old.end,1);
    const exact=next.find(b=>!claimed.has(b)&&b.text===old.text&&b.start>=start&&b.start<=Math.max(start,end));
    const candidate=exact||next.find(b=>b.start===start)||next.find(b=>start>=b.start&&start<b.end)||next.find(b=>b.start<end&&b.end>start);
    // Fully removed paragraphs keep their alternatives and notes in an explicit archive.
    if(old.text&&start===end&&!exact){if(hasExtras(old))detached.push({...clone(old),detached:true,start:-1,end:-1});continue;}
    if(candidate){
      if(!claimed.has(candidate)){candidate.id=old.id;for(const key of ['mainLabel','mainVersionId','locked'])if(old[key]!==undefined)candidate[key]=clone(old[key]);claimed.add(candidate);}
      candidate.L.push(...clone(old.L));candidate.R.push(...clone(old.R));candidate.notes.push(...clone(old.notes));
    }else if(!old.text){next.push({...clone(old),start:Math.min(start,text.length),end:Math.min(start,text.length),text:''});}
    else if(hasExtras(old))detached.push({...clone(old),detached:true,start:-1,end:-1});
  }
  if(!next.length)next.push({...newBlock(),start:0,end:0});
  next.sort((a,b)=>a.start-b.start);return [...next,...detached];
}
export function serialize(blocks){
  let offset=0;const live=blocks.filter(b=>!b.detached);if(!live.length)live.push(newBlock());
  const result=live.map((b,i)=>{if(i)offset+=2;const item={...clone(b),start:offset,end:offset+b.text.length};delete item.detached;offset=item.end;return item;});
  return {text:live.map(b=>b.text).join('\n\n'),blocks:[...result,...blocks.filter(b=>b.detached).map(clone)]};
}
export function park(blocks, id, side) {
  const result = clone(blocks), b = result.find(b => b.id === id);
  if (!canCreateBranches(b) || !b.text.trim() || !['L', 'R'].includes(side)) return null;
  b[side].unshift({ id: uid(), text: b.text, ...(b.mainLabel ? { label: b.mainLabel } : {}) });
  b.text = '';
  delete b.mainLabel;
  return serialize(result);
}
export function promote(blocks, id, side, variantId) {
  const result = clone(blocks), b = result.find(b => b.id === id);
  if (!b || b.detached || !['L', 'R'].includes(side)) return null;
  const i = b[side].findIndex(v => v.id === variantId);
  if (i < 0) return null;
  const { text, label } = b[side][i];
  if (b.text.trim()) {
    b[side][i].text = b.text;
    if (b.mainLabel) b[side][i].label = b.mainLabel;
    else delete b[side][i].label;
  } else b[side].splice(i, 1);
  b.text = text;
  if (label) b.mainLabel = label;
  else delete b.mainLabel;
  return serialize(result);
}
export function sectionIds(blocks,id){const live=blocks.filter(b=>!b.detached),at=live.findIndex(b=>b.id===id);if(at<0)return [];const lv=level(live[at]);if(!lv)return [id];let end=at+1;while(end<live.length&&(!level(live[end])||level(live[end])>lv))end++;return live.slice(at,end).map(b=>b.id);}
export function move(blocks,source,targetId,position){
  const result=clone(blocks),origin=result.find(b=>b.id===source.id),target=result.find(b=>b.id===targetId);if(!origin||!target||origin.detached||target.detached)return null;
  if(position==='L'||position==='R'){
    if(!canCreateBranches(target))return null;
    if(source.zone==='T'&&(level(origin)||origin.locked))return null;
    if(source.zone==='T'){if(!origin.text)return null;target[position].unshift({id:origin.mainVersionId||uid(),text:origin.text,...(origin.mainLabel?{label:origin.mainLabel}:{})});origin.text='';delete origin.mainLabel;delete origin.mainVersionId;}
    else{const index=origin[source.zone]?.findIndex(v=>v.id===source.variantId);if(index==null||index<0)return null;const [variant]=origin[source.zone].splice(index,1);target[position].unshift(variant);}
    return serialize(result);
  }
  if(source.zone==='T'){
    const ids=sectionIds(result,origin.id);if(ids.includes(targetId))return null;
    const moving=result.filter(b=>ids.includes(b.id)),remaining=result.filter(b=>!ids.includes(b.id)),at=remaining.findIndex(b=>b.id===targetId);
    // Preserve the block object and all its attachments when reordering.
    remaining.splice(at+(position==='after'?1:0),0,...moving);return serialize(remaining);
  }
  const index=origin[source.zone]?.findIndex(v=>v.id===source.variantId);if(index==null||index<0)return null;
  const [variant]=origin[source.zone].splice(index,1);
  if(!target.text.trim()&&!target.locked){target.text=variant.text;target.mainVersionId=variant.id;if(variant.label)target.mainLabel=variant.label;else delete target.mainLabel;}else result.splice(result.indexOf(target)+(position==='after'?1:0),0,newBlock(variant.text));
  return serialize(result);
}
export function backup(doc){return JSON.stringify({format:'branch',version:1,document:{title:doc.title,text:doc.text,blocks:doc.blocks}},null,2);}
export function importBackup(raw){
  const value=JSON.parse(raw),d=value?.document;
  if(value?.format!=='branch'||value.version!==1||!d||typeof d.title!=='string'||typeof d.text!=='string'||!Array.isArray(d.blocks)||!d.blocks.length||d.blocks.length>20000)throw new Error('Formato Branch non valido');
  const ids=new Set();for(const b of d.blocks){if(!b||typeof b.id!=='string'||ids.has(b.id)||typeof b.text!=='string')throw new Error('Paragrafo non valido');ids.add(b.id);for(const side of ['L','R','notes']){if(!Array.isArray(b[side])||b[side].some(v=>!v||typeof v.id!=='string'||typeof v.text!=='string'))throw new Error('Allegato non valido');}}
  // Validate exact offsets against source instead of silently dropping malformed data.
  let end=0;for(const b of d.blocks.filter(b=>!b.detached)){if(!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<0||b.start<end||b.end<b.start||d.text.slice(b.start,b.end)!==b.text||d.text.slice(end,b.start).trim())throw new Error('Posizioni dei paragrafi non valide');end=b.end;}if(d.text.slice(end).trim())throw new Error('Testo non associato ai paragrafi');
  return {id:uid(),title:d.title,text:d.text,blocks:clone(d.blocks),updated:Date.now()};
}
export const seedText='# La città come testo\n\nUna città si legge come si legge un testo lungo: per paragrafi, tornando indietro, correggendo l’ordine in cui le cose sono state dette.\n\nLe strade principali formano il tronco del racconto. Le vie laterali portano a versioni diverse della stessa storia.\n\n## Scegliere, senza perdere\n\nScrivere significa scegliere, ma scegliere senza perdere ciò che si lascia da parte.\n\nQui puoi continuare. Oppure mettere da parte una frase, provare una strada diversa e tornare sui tuoi passi.';
export function seedDocument(){const blocks=fromMarkdown(seedText);blocks[1].L=[{id:uid(),text:'Una città si può leggere come un libro, ma è un libro che nessuno ha scritto da solo.'}];blocks[1].R=[{id:uid(),text:'Leggere una città significa accettare di non arrivare mai all’ultima pagina.'}];blocks[2].R=[{id:uid(),text:'I vicoli sono le varianti che l’autore non ha scelto ma non ha avuto il coraggio di cancellare.'}];return {id:uid(),title:'La città come testo',text:seedText,blocks,updated:Date.now()};}

// The hierarchy follows heading levels, including skipped levels and siblings.
export function mapHierarchy(blocks) {
  const stack = [];
  return blocks.filter(block => !block.detached).map(block => {
    const headingLevel = level(block);
    if (headingLevel) {
      while (stack.length && stack.at(-1).level >= headingLevel) stack.pop();
    }
    const row = { block, level: headingLevel, ancestors: [...stack] };
    if (headingLevel) stack.push({ id: block.id, level: headingLevel });
    return row;
  });
}

// Only the generated Markdown includes references: the editor source is untouched.
export function markdownWithNotes(doc) {
  const blocks = doc.blocks || [];
  if (!blocks.some(block => block.notes.length)) return doc.text;
  const reserved = new Set([...doc.text.matchAll(/\[\^([^\]\n]+)\]/g)].map(match => match[1]));
  const definitions = [], inserts = new Map(), archived = [];
  let counter = 0;
  for (const block of blocks) {
    if (!block.notes.length) continue;
    const references = block.notes.map(note => {
      let id;
      do { id = 'branch-' + ++counter; } while (reserved.has(id));
      reserved.add(id);
      const content = (note.text || '(Nota vuota)').replace(/\r\n?/g, '\n');
      definitions.push('[^' + id + ']: ' + content.split('\n').join('\n    '));
      return '[^' + id + ']';
    }).join('');
    if (block.detached) {
      const context = label(block).replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>]/g, '\\$&');
      archived.push('- ' + context + references);
    } else {
      // Keep references outside fenced/indented code and table rows.
      const separate = /(?:^|\n) {0,3}(?:`{3,}|~{3,})[^\n]*$/.test(block.text)
        || /^(?: {4}|\t)/.test(block.text)
        || /(?:^|\n)\s*\|.*\|\s*$/.test(block.text);
      const suffix = (separate ? '\n\n' : '') + references;
      inserts.set(block.end, (inserts.get(block.end) || '') + suffix);
    }
  }
  let body = doc.text;
  for (const [at, insert] of [...inserts.entries()].sort((a, b) => b[0] - a[0])) {
    body = body.slice(0, at) + insert + body.slice(at);
  }
  let appendix = '## Note\n\n';
  if (archived.length) appendix += '### Paragrafi fuori dal testo\n\n' + archived.join('\n') + '\n\n';
  return body.trimEnd() + '\n\n' + appendix + definitions.join('\n\n') + '\n';
}

// Directional arrows exchange the trunk with a chosen branch, or park it on an empty side.
export function transfer(blocks, id, side, variantId = null) {
  if (!['L', 'R'].includes(side)) return null;
  const block = blocks.find(item => item.id === id && !item.detached);
  if (!block) return null;
  if (block[side].length) {
    const variant = block[side].find(item => item.id === variantId) || block[side][0];
    return promote(blocks, id, side, variant.id);
  }
  return park(blocks, id, side);
}

// L and R are ordered from the center outward. Moving right takes R[0]
// into the center and moves the previous center to L[0], without swapping order.
export function slideVersion(blocks, id, side) {
  if (!['L', 'R'].includes(side)) return null;
  const result = clone(blocks), block = result.find(b => b.id === id && !b.detached);
  if (!block || block.locked || (!canCreateBranches(block) && !block[side].length)) return null;
  const incoming = block[side].shift();
  if (!incoming && !block.text.trim() && !block.mainLabel) return null;
  const other = side === 'R' ? 'L' : 'R';
  if (block.text.trim() || block.mainLabel) block[other].unshift({
    id: block.mainVersionId || uid(), text: block.text,
    ...(block.mainLabel ? { label: block.mainLabel } : {}),
  });
  block.text = incoming?.text || '';
  block.mainVersionId = incoming?.id || uid();
  if (incoming?.label) block.mainLabel = incoming.label;
  else delete block.mainLabel;
  return serialize(result);
}

export function focusVersion(blocks, id, side, variantId, pin = false) {
  if (!['L', 'R'].includes(side)) return null;
  let result = { blocks: clone(blocks) };
  const block = result.blocks.find(b => b.id === id && !b.detached);
  if (!block || (block.locked && !pin)) return null;
  const index = block[side].findIndex(v => v.id === variantId);
  if (index < 0) return null;
  block.locked = false;
  for (let i = 0; i <= index; i++) {
    result = slideVersion(result.blocks, id, side);
    if (!result) return null;
  }
  if (pin) result.blocks.find(b => b.id === id).locked = true;
  return result;
}

export function removeVersion(blocks, id, side = null, variantId = null) {
  const result = clone(blocks), block = result.find(b => b.id === id && !b.detached);
  if (!block) return null;
  if (side) {
    if (!['L', 'R'].includes(side)) return null;
    const index = block[side].findIndex(v => v.id === variantId);
    if (index < 0) return null;
    block[side].splice(index, 1);
  } else {
    const incoming = block.R.shift() || block.L.shift();
    block.text = incoming?.text || '';
    block.mainVersionId = incoming?.id || uid();
    if (incoming?.label) block.mainLabel = incoming.label;
    else delete block.mainLabel;
    block.locked = false;
  }
  return serialize(result);
}

// CodeMirror offsets are UTF-16 positions, including for Unicode selections.
export function formatSelection(text, from, to, command) {
  const wrappers = { bold: ['**', '**'], italic: ['_', '_'], underline: ['<u>', '</u>'] };
  if (wrappers[command]) {
    const [left, right] = wrappers[command], selected = text.slice(from, to);
    if (selected.startsWith(left) && selected.endsWith(right) && selected.length >= left.length + right.length) {
      const insert = selected.slice(left.length, -right.length);
      return { from, to, insert, anchor: from, head: from + insert.length };
    }
    if (text.slice(from - left.length, from) === left && text.slice(to, to + right.length) === right) {
      return { from: from - left.length, to: to + right.length, insert: selected, anchor: from - left.length, head: from - left.length + selected.length };
    }
    return { from, to, insert: left + selected + right, anchor: from + left.length, head: to + left.length };
  }
  if (!['bullet', 'number'].includes(command)) return null;
  const start = from > 0 ? text.lastIndexOf('\n', from - 1) + 1 : 0;
  const lastPosition = to > from && text[to - 1] === '\n' ? to - 1 : to;
  let end = text.indexOf('\n', lastPosition);
  if (end < 0) end = text.length;
  const lines = text.slice(start, end).split('\n');
  const already = command === 'bullet' ? /^([ \t]*)[-+*][ \t]+/ : /^([ \t]*)\d+[.)][ \t]+/;
  const populated = lines.filter(line => line.trim());
  const remove = populated.length > 0 && populated.every(line => already.test(line));
  let number = 0;
  const result = lines.map(line => {
    if (!line.trim() && lines.length > 1) return line;
    if (remove) return line.replace(already, '$1');
    const match = /^([ \t]*)(?:[-+*][ \t]+|\d+[.)][ \t]+)?(.*)$/.exec(line);
    const prefix = command === 'bullet' ? '- ' : ++number + '. ';
    return match[1] + prefix + match[2];
  });
  const insert = result.join('\n');
  const cursor = Math.min(start + insert.length, Math.max(start, from + result[0].length - lines[0].length));
  return { from: start, to: end, insert, anchor: from === to ? cursor : start, head: from === to ? cursor : start + insert.length };
}

// Keep unchanged text positions intact so formatting cannot reattach notes to another paragraph.
export function formatChanges(text, edit) {
  const before = text.slice(edit.from, edit.to).split('\n'), after = edit.insert.split('\n');
  if (before.length !== after.length) return [{ from: edit.from, to: edit.to, insert: edit.insert }];
  const changes = [];
  let offset = edit.from;
  for (let index = 0; index < before.length; index++) {
    const oldLine = before[index], newLine = after[index];
    let left = 0, right = 0;
    while (left < oldLine.length && left < newLine.length && oldLine[left] === newLine[left]) left++;
    while (right < oldLine.length - left && right < newLine.length - left && oldLine[oldLine.length - 1 - right] === newLine[newLine.length - 1 - right]) right++;
    if (left !== oldLine.length || left !== newLine.length) changes.push({ from: offset + left, to: offset + oldLine.length - right, insert: newLine.slice(left, newLine.length - right) });
    offset += oldLine.length + 1;
  }
  return changes;
}
