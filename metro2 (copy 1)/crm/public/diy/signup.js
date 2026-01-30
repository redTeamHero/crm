(() => {
  const firstName = document.getElementById('firstName');
  const lastName = document.getElementById('lastName');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirmPassword');
  const btnSignup = document.getElementById('btnSignup');
  const err = document.getElementById('err');

  function showError(msg) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }

  function hideError() {
    err.classList.add('hidden');
  }

  function getSelectedPlan() {
    const checked = document.querySelector('input[name="plan"]:checked');
    return checked ? checked.value : 'free';
  }

  btnSignup.addEventListener('click', async () => {
    hideError();

    const firstVal = firstName.value.trim();
    const lastVal = lastName.value.trim();
    const emailVal = email.value.trim();
    const passVal = password.value;
    const confirmVal = confirmPassword.value;
    const plan = getSelectedPlan();

    if (!firstVal || !lastVal) {
      showError('Please enter your first and last name');
      return;
    }
    if (!emailVal) {
      showError('Please enter your email address');
      return;
    }
    if (passVal.length < 8) {
      showError('Password must be at least 8 characters');
      return;
    }
    if (passVal !== confirmVal) {
      showError('Passwords do not match');
      return;
    }

    btnSignup.disabled = true;
    btnSignup.textContent = 'Creating account...';

    try {
      const res = await fetch('/api/diy/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstVal,
          lastName: lastVal,
          email: emailVal,
          password: passVal,
          plan
        })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      if (data.token) {
        localStorage.setItem('diy_token', data.token);
      }
      window.location.href = '/diy/dashboard';
    } catch (e) {
      showError(e.message);
      btnSignup.disabled = false;
      btnSignup.textContent = 'Create Account';
    }
  });

  confirmPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSignup.click();
  });
})();
