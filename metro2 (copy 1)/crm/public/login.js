/* public/login.js */

// If a user already has valid auth, skip the login form
document.addEventListener('DOMContentLoaded', async () => {
  const headers = authHeader();
  if (!headers.Authorization) return; // nothing saved
  try {
    const res = await fetch('/api/me', { headers });
    if (res.ok) {
      location.href = '/clients';
    }
  } catch {
    /* ignore network or auth errors and show login */
  }
});
async function handleAuth(endpoint, body, role){
  try{
    const res = await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(!res.ok || !data.ok){
      throw new Error(data.error || 'Request failed');
    }
    if(data.token){
      // start a fresh local state for the newly authenticated user
      // so previous user data doesn't leak between accounts
      localStorage.clear();

      localStorage.setItem('token', data.token);
      // legacy basic auth support for host/client
      if(body.username){
        localStorage.setItem('auth', btoa(`${body.username}:${body.password}`));
      }
      switch(role){
        case 'client':
          location.href = '/client-portal-template.html';
          break;
        case 'team':
          location.href = '/team-member-template.html';
          break;
        default:
          location.href = '/clients';
      }
    }
  }catch(err){
    showError(err.message);
  }
}

function showError(msg){
  const el = document.getElementById('err');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.getElementById('btnLogin').addEventListener('click', ()=>{
  const role = document.querySelector('input[name="role"]:checked').value;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if(!username || !password){
    showError('Username/token and password required');
    return;
  }
  let endpoint, body;
  if(role === 'host'){
    endpoint = '/api/login';
    body = { username, password };
  }else if(role === 'client'){
    endpoint = '/api/client/login';
    body = { username, password };
  }else{
    endpoint = `/api/team/${encodeURIComponent(username)}/login`;
    body = { password };
  }
  handleAuth(endpoint, body, role);
});

document.getElementById('btnRegister').addEventListener('click', ()=>{
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if(!username || !password){
    showError('Username and password required');
    return;
  }
  handleAuth('/api/register', { username, password }, 'host');
});

// simple password reset flow using prompts
 document.getElementById('btnReset').addEventListener('click', async ()=>{
  const username = prompt('Enter username for reset:');
  if(!username) return;
  try{
    const res = await fetch('/api/request-password-reset',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username})
    });
    const data = await res.json();
    if(!res.ok || !data.ok){ throw new Error(data.error || 'Request failed'); }
    const token = data.token;
    const newPass = prompt('Enter new password:');
    if(!newPass) return;
    const res2 = await fetch('/api/reset-password',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username, token, password:newPass})
    });
    const data2 = await res2.json();
    if(!res2.ok || !data2.ok){ throw new Error(data2.error || 'Reset failed'); }
    showError('Password reset. Please login with new password.');
  }catch(err){
    showError(err.message);
  }
});
