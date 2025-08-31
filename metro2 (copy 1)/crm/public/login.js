/* public/login.js */
async function handleAuth(endpoint){
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if(!username || !password){
    showError('Username and password required');
    return;
  }
  try{
    const res = await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
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
        // legacy basic auth support
        localStorage.setItem('auth', btoa(`${username}:${password}`));
        location.href = '/clients';
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

document.getElementById('btnLogin').addEventListener('click', ()=>handleAuth('/api/login'));
document.getElementById('btnRegister').addEventListener('click', ()=>handleAuth('/api/register'));

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
