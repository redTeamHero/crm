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

function openRegisterModal() {
  const modal = document.getElementById('registerModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('registerErr').classList.add('hidden');
  const loginUser = document.getElementById('username').value.trim();
  if (loginUser) document.getElementById('regUsername').value = loginUser;
}

function closeRegisterModal() {
  const modal = document.getElementById('registerModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function showRegisterError(msg) {
  const el = document.getElementById('registerErr');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.getElementById('btnRegister').addEventListener('click', openRegisterModal);
document.getElementById('closeRegisterModal').addEventListener('click', closeRegisterModal);
document.getElementById('backToLogin').addEventListener('click', (e) => { e.preventDefault(); closeRegisterModal(); });
document.getElementById('registerModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeRegisterModal(); });

document.getElementById('btnSubmitRegister').addEventListener('click', () => {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const company = document.getElementById('regCompany').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regPasswordConfirm').value;

  if (!name) { showRegisterError('Full name is required'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showRegisterError('A valid email is required'); return; }
  if (!username) { showRegisterError('Username is required'); return; }
  if (!password || password.length < 6) { showRegisterError('Password must be at least 6 characters'); return; }
  if (password !== confirm) { showRegisterError('Passwords do not match'); return; }

  handleAuth('/api/register', { name, email, phone, company, username, password }, { basicAuth: btoa(`${username}:${password}`) });
});

// Forgot password modal flow
(function initResetModal(){
  var modal = document.getElementById('resetModal');
  var step1 = document.getElementById('resetStep1');
  var step2 = document.getElementById('resetStep2');
  var step3 = document.getElementById('resetStep3');
  var err1 = document.getElementById('resetErr1');
  var err2 = document.getElementById('resetErr2');
  var emailInput = document.getElementById('resetEmail');
  var codeInput = document.getElementById('resetCode');
  var newPassInput = document.getElementById('resetNewPass');
  var confirmPassInput = document.getElementById('resetConfirmPass');
  var btnSend = document.getElementById('btnSendCode');
  var btnReset = document.getElementById('btnResetPassword');
  var btnResend = document.getElementById('btnResendCode');
  var btnBack = document.getElementById('btnBackToLogin');
  var resetEmailAddr = '';

  function showResetErr(el, msg){ el.textContent = msg; el.classList.remove('hidden'); }
  function hideResetErr(el){ el.classList.add('hidden'); }
  function showStep(n){
    step1.classList.toggle('hidden', n !== 1);
    step2.classList.toggle('hidden', n !== 2);
    step3.classList.toggle('hidden', n !== 3);
    hideResetErr(err1); hideResetErr(err2);
  }
  function openResetModal(){
    modal.classList.remove('hidden'); modal.classList.add('flex');
    showStep(1);
    emailInput.value = ''; codeInput.value = ''; newPassInput.value = ''; confirmPassInput.value = '';
    emailInput.focus();
  }
  function closeResetModal(){
    modal.classList.add('hidden'); modal.classList.remove('flex');
  }

  document.getElementById('btnReset').addEventListener('click', openResetModal);
  document.getElementById('closeResetModal').addEventListener('click', closeResetModal);
  modal.addEventListener('click', function(e){ if(e.target === modal) closeResetModal(); });

  btnSend.addEventListener('click', async function(){
    hideResetErr(err1);
    var email = emailInput.value.trim();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      showResetErr(err1, 'Please enter a valid email address'); return;
    }
    btnSend.disabled = true; btnSend.textContent = 'Sending...';
    try{
      var res = await fetch('/api/request-password-reset', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:email})
      });
      var data = await res.json();
      if(!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
      resetEmailAddr = email;
      showStep(2);
      codeInput.focus();
    }catch(e){
      showResetErr(err1, e.message);
    }finally{
      btnSend.disabled = false; btnSend.textContent = 'Send Reset Code';
    }
  });

  btnResend.addEventListener('click', async function(e){
    e.preventDefault();
    if(!resetEmailAddr) return;
    btnResend.textContent = 'Sending...';
    try{
      await fetch('/api/request-password-reset', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:resetEmailAddr})
      });
      btnResend.textContent = 'Code sent!';
      setTimeout(function(){ btnResend.textContent = 'Resend'; }, 3000);
    }catch(e){
      btnResend.textContent = 'Resend';
    }
  });

  btnReset.addEventListener('click', async function(){
    hideResetErr(err2);
    var code = codeInput.value.trim();
    var pass = newPassInput.value;
    var confirm = confirmPassInput.value;
    if(!code || code.length !== 6){ showResetErr(err2, 'Please enter the 6-digit code'); return; }
    if(!pass || pass.length < 6){ showResetErr(err2, 'Password must be at least 6 characters'); return; }
    if(pass !== confirm){ showResetErr(err2, 'Passwords do not match'); return; }
    btnReset.disabled = true; btnReset.textContent = 'Resetting...';
    try{
      var res = await fetch('/api/reset-password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:resetEmailAddr, code:code, password:pass})
      });
      var data = await res.json();
      if(!res.ok || !data.ok) throw new Error(data.error || 'Reset failed');
      showStep(3);
    }catch(e){
      showResetErr(err2, e.message);
    }finally{
      btnReset.disabled = false; btnReset.textContent = 'Reset Password';
    }
  });

  btnBack.addEventListener('click', closeResetModal);
})();
