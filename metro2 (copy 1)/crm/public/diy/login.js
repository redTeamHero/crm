(() => {
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const btnLogin = document.getElementById('btnLogin');
  const err = document.getElementById('err');

  function showError(msg) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }

  function hideError() {
    err.classList.add('hidden');
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
      const res = await fetch('/api/diy/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal, password: passVal })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Login failed');
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
})();
