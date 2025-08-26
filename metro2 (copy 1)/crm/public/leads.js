async function fetchLeads(){
  const res = await fetch('/api/leads');
  return res.json();
}

function leadRow(lead){
  const div = document.createElement('div');
  div.className = 'flex items-center justify-between border rounded px-2 py-1';
  div.innerHTML = `<div>
    <div class="font-medium">${lead.name || 'Unnamed'}</div>
    <div class="text-xs">${lead.email || ''} ${lead.phone || ''}</div>
    <div class="text-xs">${lead.source || ''}</div>
    <div class="text-xs">${lead.notes || ''}</div>
  </div>
  <div class="flex gap-2">
    <button class="convert btn text-xs" data-id="${lead.id}">Convert</button>
    <button class="delete btn text-xs bg-red-500 text-white" data-id="${lead.id}">Delete</button>
  </div>`;

  return div;
}

async function renderLeads(){
  const data = await fetchLeads();
  const list = document.getElementById('leadList');
  list.innerHTML = '';
  data.leads.forEach(l=>{
    const row = leadRow(l);
    row.querySelector('.convert').addEventListener('click', async()=>{

      await fetch('/api/consumers', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:l.name, email:l.email, phone:l.phone })
      });
      await fetch(`/api/leads/${l.id}`, { method:'DELETE' });
      window.location.href = '/clients';
    });
    row.querySelector('.delete').addEventListener('click', async()=>{
      await fetch(`/api/leads/${l.id}`, { method:'DELETE' });
      renderLeads();
    });

    list.appendChild(row);
  });
}

document.getElementById('saveLead').addEventListener('click', async()=>{
  const lead = {
    name: document.getElementById('leadName').value.trim(),
    email: document.getElementById('leadEmail').value.trim(),
    phone: document.getElementById('leadPhone').value.trim(),
    source: document.getElementById('leadSource').value.trim(),
    notes: document.getElementById('leadNotes').value.trim()
  };
  await fetch('/api/leads', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(lead)
  });
  document.getElementById('leadName').value='';
  document.getElementById('leadEmail').value='';
  document.getElementById('leadPhone').value='';
  document.getElementById('leadSource').value='';
  document.getElementById('leadNotes').value='';
  renderLeads();
});

renderLeads();
