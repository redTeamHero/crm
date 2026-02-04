/* public/login.js */

function redirectByRole(user){
  const role = user?.role;
  const perms = user?.permissions || [];
  if(role === 'client'){
    const clientId = user?.id || localStorage.getItem('clientId');
    if(clientId){
      try { localStorage.setItem('clientId', clientId); } catch {}
      location.href = `/portal/${encodeURIComponent(clientId)}`;
    } else {
      location.href = '/client-portal';
    }
    return;
  }else if(role === 'team'){
    try { localStorage.removeItem('clientId'); } catch {}
    location.href = '/team-member-template.html';
  }else if(role === 'admin' || (role === 'member' && perms.includes('consumers'))){
    try { localStorage.removeItem('clientId'); } catch {}
    location.href = '/clients';
  }else{
    try { localStorage.removeItem('clientId'); } catch {}
    location.href = '/clients';
  }
}

// If a user already has valid auth, skip the login form
document.addEventListener('DOMContentLoaded', async () => {

  const headers = authHeader();
  if (!headers.Authorization) return; // nothing saved
  try {
    const res = await fetch('/api/me', { headers });
    if (res.ok) {
      const data = await res.json();
      redirectByRole(data.user);
    }
  } catch {
    /* ignore network or auth errors and show login */
  }
});

async function handleAuth(endpoint, body, options = {}){
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
      if(options.basicAuth){
        localStorage.setItem('auth', options.basicAuth);
      }
      try{
        const meRes = await fetch('/api/me', { headers: authHeader() });
        if(meRes.ok){
          const meData = await meRes.json();
          redirectByRole(meData.user);
          return;
        }
      }catch{}
      redirectByRole();
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
  let endpoint, body, options = {};
  if(role === 'host'){
    if(!username || !password){
      showError('Username and password required');
      return;
    }
    endpoint = '/api/login';
    body = { username, password };
    options.basicAuth = btoa(`${username}:${password}`);
  }else if(role === 'client'){
    if(!username){
      showError('Email or portal token required');
      return;
    }
    endpoint = '/api/client/login';
    if(username.includes('@')){
      if(!password){
        showError('Password required for email login');
        return;
      }
      body = { email: username, password };
      options.basicAuth = btoa(`${username}:${password}`);
    }else{
      body = { token: username };
      if(password){
        body.password = password;
      }
    }
  }else{
    if(!username || !password){
      showError('Invite token and password required');
      return;
    }
    endpoint = `/api/team/${encodeURIComponent(username)}/login`;
    body = { password };
  }
  handleAuth(endpoint, body, options);
});

document.getElementById('btnRegister').addEventListener('click', ()=>{
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if(!username || !password){
    showError('Username and password required');
    return;
  }
  handleAuth('/api/register', { username, password }, { basicAuth: btoa(`${username}:${password}`) });
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
