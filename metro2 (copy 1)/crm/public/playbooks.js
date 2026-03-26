// public/playbooks.js
// Exposes available dispute letter playbooks to the browser,
// including user-defined sequences saved in the library.

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

async function loadPlaybooks(){
  try{
    const res = await fetch('/api/templates', { cache: 'no-store' });
    const data = await res.json();
    const templateMap = Object.fromEntries((data.templates || []).map(t => [t.id, t.heading]));
    const seqPlaybooks = {};
    for (const seq of data.sequences || []){
      seqPlaybooks[seq.id] = {
        name: seq.name,
        letters: (seq.templates || []).map(id => templateMap[id] || id)
      };
    }
    return { ...STATIC_PLAYBOOKS, ...seqPlaybooks };
  }catch{
    return STATIC_PLAYBOOKS;
  }
}

export const PLAYBOOKS = await loadPlaybooks();
export default PLAYBOOKS;
