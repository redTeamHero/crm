// notification-settings.js
// Loads and saves host notification settings on the settings page

(function () {
  const EVENT_IDS = [
    'consumer_created',
    'billing_plan_cycle_processed',
    'billing_plan_created',
    'report_uploaded',
    'file_uploaded',
    'letters_generated',
    'letters_mailed',
    'dispute_response',
    'call_booked',
  ];

  function authHeader() {
    const tok = localStorage.getItem('token');
    return tok ? { Authorization: 'Bearer ' + tok } : {};
  }

  function el(id) { return document.getElementById(id); }

  function applySettings(s) {
    const inApp = el('notifInApp');
    const email = el('notifEmail');
    const emailAddr = el('notifEmailAddress');
    const emailRow = el('notifEmailRow');
    const sms = el('notifSms');
    const smsNum = el('notifSmsNumber');
    const smsRow = el('notifSmsRow');

    if (inApp) inApp.checked = s.inApp !== false;
    if (email) email.checked = !!s.email;
    if (emailAddr) emailAddr.value = s.emailAddress || '';
    if (emailRow) emailRow.classList.toggle('hidden', !s.email);
    if (sms) sms.checked = !!s.sms;
    if (smsNum) smsNum.value = s.smsNumber || '';
    if (smsRow) smsRow.classList.toggle('hidden', !s.sms);

    const events = s.events || {};
    for (const evtId of EVENT_IDS) {
      const chk = el('notifEvt_' + evtId);
      if (chk) chk.checked = events[evtId] !== false;
    }
  }

  function collectSettings() {
    const settings = {
      inApp: !!(el('notifInApp') && el('notifInApp').checked),
      email: !!(el('notifEmail') && el('notifEmail').checked),
      emailAddress: (el('notifEmailAddress') && el('notifEmailAddress').value.trim()) || '',
      sms: !!(el('notifSms') && el('notifSms').checked),
      smsNumber: (el('notifSmsNumber') && el('notifSmsNumber').value.trim()) || '',
      events: {},
    };
    for (const evtId of EVENT_IDS) {
      const chk = el('notifEvt_' + evtId);
      settings.events[evtId] = !!(chk && chk.checked);
    }
    return settings;
  }

  function init() {
    const panel = el('notifSettingsPanel');
    if (!panel) return;

    const tok = localStorage.getItem('token');
    if (!tok) return;

    const emailChk = el('notifEmail');
    const emailRow = el('notifEmailRow');
    const smsChk = el('notifSms');
    const smsRow = el('notifSmsRow');

    if (emailChk && emailRow) {
      emailChk.addEventListener('change', function () {
        emailRow.classList.toggle('hidden', !emailChk.checked);
      });
    }
    if (smsChk && smsRow) {
      smsChk.addEventListener('change', function () {
        smsRow.classList.toggle('hidden', !smsChk.checked);
      });
    }

    fetch('/api/notifications/settings', { headers: authHeader() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.ok && data.settings) {
          applySettings(data.settings);
        }
      })
      .catch(function () {});

    const saveBtn = el('saveNotifSettings');
    const saveMsg = el('notifSettingsMsg');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        const settings = collectSettings();
        fetch('/api/notifications/settings', {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
          body: JSON.stringify(settings),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.ok) {
              if (saveMsg) {
                saveMsg.classList.remove('hidden');
                setTimeout(function () { saveMsg.classList.add('hidden'); }, 2500);
              }
            }
          })
          .catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
