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
})();
