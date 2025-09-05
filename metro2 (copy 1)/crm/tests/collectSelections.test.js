import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// minimal DOM stubs
function dummy(){
  return new Proxy(function(){}, {
    get(_t, _p){
      if(_p === 'classList') return { add(){}, remove(){}, toggle(){} };
      if(_p === 'content') return dummy();
      if(_p === 'style') return {};
      return dummy();
    },
    apply(){ return dummy(); }
  });
}

const ocrEl = { checked:false };

globalThis.document = {
  querySelector: (sel)=> {
    if (sel === '#cbUseOcr') return ocrEl;
    if (sel === '#err') return null; // force alert in showErr
    return dummy();
  },
  querySelectorAll: () => [],
  createElement: () => dummy(),
};
globalThis.window = { location:{ href:'' } };
globalThis.MutationObserver = class { constructor(){} observe(){} disconnect(){} };
globalThis.localStorage = { getItem(){ return null; }, setItem(){} };
const warnings = [];
globalThis.alert = (msg) => warnings.push(msg);
globalThis.fetch = () => Promise.resolve({ json: () => Promise.resolve({ consumers: [] }) });
globalThis.getSelectedConsumerId = () => null;
globalThis.setSelectedConsumerId = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(__dirname, '..', 'public', 'index.js');

const module = await import(modPath);
const { collectSelections, selectionState } = module;

selectionState[1] = { bureaus:['Experian'], specialMode:'identity' };
selectionState[2] = { bureaus:[], specialMode:'identity' };

const selections = collectSelections();

await test('collectSelections skips incomplete special modes', () => {
  assert.equal(selections.length, 1);
  assert.equal(selections[0].tradelineIndex, 1);
  assert.ok(warnings.length === 1);
});
