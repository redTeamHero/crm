(() => {
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const btnLogin = document.getElementById('btnLogin');
  const err = document.getElementById('err');

  function showError(msg) {
    err.textContent = msg;
    err.classList.add('visible');
    err.style.display = 'block';
  }

  function hideError() {
    err.classList.remove('visible');
    err.style.display = 'none';
  }

  btnLogin.addEventListener('click', async () => {
    hideError();
    const emailVal = email.value.trim();
    const passVal = password.value;

    if (!emailVal || !passVal) {
      showError('Please enter email and password');
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Signing in...';

    try {
      let res;
      try {
        res = await fetch('/api/diy/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailVal, password: passVal })
        });
      } catch (networkErr) {
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
      }

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error('Something went wrong. Please try again in a moment.');
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Login failed. Please try again.');
      }

      if (data.token) {
        localStorage.setItem('diy_token', data.token);
      }
      window.location.href = '/diy/dashboard';
    } catch (e) {
      showError(e.message);
      btnLogin.disabled = false;
      btnLogin.textContent = 'Sign In';
    }
  });

  password.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnLogin.click();
  });

  // Forgot password flow
  var modal = document.getElementById('resetModal');
  var step1 = document.getElementById('diyResetStep1');
  var step2 = document.getElementById('diyResetStep2');
  var step3 = document.getElementById('diyResetStep3');
  var err1 = document.getElementById('diyResetErr1');
  var err2 = document.getElementById('diyResetErr2');
  var resetEmailInput = document.getElementById('diyResetEmail');
  var codeInput = document.getElementById('diyResetCode');
  var newPassInput = document.getElementById('diyResetNewPass');
  var confirmPassInput = document.getElementById('diyResetConfirmPass');
  var resetEmailAddr = '';

  function showResetErr(el, msg){ el.textContent = msg; el.style.display = 'block'; el.classList.add('visible'); }
  function hideResetErr(el){ el.style.display = 'none'; el.classList.remove('visible'); }
  function showResetStep(n){
    step1.style.display = n === 1 ? '' : 'none';
    step2.style.display = n === 2 ? '' : 'none';
    step3.style.display = n === 3 ? '' : 'none';
    hideResetErr(err1); hideResetErr(err2);
  }
  function openResetModal(){
    modal.style.display = 'flex';
    showResetStep(1);
    resetEmailInput.value = ''; codeInput.value = ''; newPassInput.value = ''; confirmPassInput.value = '';
    resetEmailInput.focus();
  }
  function closeResetModal(){ modal.style.display = 'none'; }

  document.getElementById('btnForgot').addEventListener('click', function(e){ e.preventDefault(); openResetModal(); });
  document.getElementById('closeResetModal').addEventListener('click', closeResetModal);
  modal.addEventListener('click', function(e){ if(e.target === modal) closeResetModal(); });

  document.getElementById('diyBtnSendCode').addEventListener('click', async function(){
    hideResetErr(err1);
    var em = resetEmailInput.value.trim();
    if(!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){
      showResetErr(err1, 'Please enter a valid email address'); return;
    }
    this.disabled = true; this.textContent = 'Sending...';
    try{
      var res = await fetch('/api/diy/request-password-reset', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:em})
      });
      var data = await res.json();
      if(!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
      resetEmailAddr = em;
      showResetStep(2);
      codeInput.focus();
    }catch(e2){
      showResetErr(err1, e2.message);
    }finally{
      this.disabled = false; this.textContent = 'Send Reset Code';
    }
  });

  document.getElementById('diyBtnResend').addEventListener('click', async function(e2){
    e2.preventDefault();
    if(!resetEmailAddr) return;
    this.textContent = 'Sending...';
    try{
      await fetch('/api/diy/request-password-reset', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:resetEmailAddr})
      });
      this.textContent = 'Code sent!';
      var self = this;
      setTimeout(function(){ self.textContent = 'Resend'; }, 3000);
    }catch(e3){ this.textContent = 'Resend'; }
  });

  document.getElementById('diyBtnResetPassword').addEventListener('click', async function(){
    hideResetErr(err2);
    var code = codeInput.value.trim();
    var pass = newPassInput.value;
    var confirm = confirmPassInput.value;
    if(!code || code.length !== 6){ showResetErr(err2, 'Please enter the 6-digit code'); return; }
    if(!pass || pass.length < 8){ showResetErr(err2, 'Password must be at least 8 characters'); return; }
    if(pass !== confirm){ showResetErr(err2, 'Passwords do not match'); return; }
    this.disabled = true; this.textContent = 'Resetting...';
    try{
      var res = await fetch('/api/diy/reset-password', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:resetEmailAddr, code:code, password:pass})
      });
      var data = await res.json();
      if(!res.ok || !data.ok) throw new Error(data.error || 'Reset failed');
      showResetStep(3);
    }catch(e2){
      showResetErr(err2, e2.message);
    }finally{
      this.disabled = false; this.textContent = 'Reset Password';
    }
  });

  document.getElementById('diyBtnBackToLogin').addEventListener('click', closeResetModal);
})();
