// playbook.js
// Defines dispute letter sequences ("sequence attacks") and loads any
// user-created sequences from the letter database.

import { readKey } from './kvdb.js';

// Built-in playbooks shipped with the app
const STATIC_PLAYBOOKS = {
  metro2ComplianceSequence: {
    name: 'Metro 2 compliance sequence',
    letters: [
      'Metro 2 inconsistency dispute',
      'Factual errors layer',
      'Deletion demand failure to fix under Metro 2 and FCRA 607(b)'
    ]
  },
  'playbook-pay-for-delete': {
    name: 'Pay for Delete Negotiation',
    letters: [
      'Pay-for-Delete Settlement Offer (40%)',
      'Pay-for-Delete Follow-Up (No Response)',
      'Pay-for-Delete Counter-Offer Response',
      'Pay-for-Delete Post-Payment Deletion Demand'
    ]
  }
};

// Merge static playbooks with sequences saved in the letters DB
export async function loadPlaybooks(){
  const db = await readKey('letters', null);
  const templateMap = Object.fromEntries((db?.templates || []).map(t => [t.id, t.heading]));
  const seqPlaybooks = {};
  for (const seq of db?.sequences || []){
    seqPlaybooks[seq.id] = {
      name: seq.name,
      letters: (seq.templates || []).map(id => templateMap[id] || id)
    };
  }
  return { ...STATIC_PLAYBOOKS, ...seqPlaybooks };
}

