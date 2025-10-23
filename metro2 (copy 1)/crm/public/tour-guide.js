/* public/tour-guide.js */

const DEFAULT_WAIT_ATTEMPTS = 40;
const DEFAULT_WAIT_INTERVAL = 150;
let shepherdWaitPromise = null;

function waitForShepherd({ attempts = DEFAULT_WAIT_ATTEMPTS, interval = DEFAULT_WAIT_INTERVAL } = {}) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Shepherd) return Promise.resolve(window.Shepherd);
  if (shepherdWaitPromise) return shepherdWaitPromise;
  shepherdWaitPromise = new Promise((resolve) => {
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (window.Shepherd) {
        window.clearInterval(timer);
        shepherdWaitPromise = null;
        resolve(window.Shepherd);
      } else if (tries >= attempts) {
        window.clearInterval(timer);
        shepherdWaitPromise = null;
        resolve(null);
      }
    }, interval);
  });
  return shepherdWaitPromise;
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  const { localStorage } = window;
  if (!localStorage) return null;
  try {
    localStorage.getItem('__tour_storage_check__');
  } catch (err) {
    return null;
  }
  return localStorage;
}

function createDefaultButtons(tour, index, totalSteps) {
  const buttons = [];
  if (index > 0) {
    buttons.push({
      text: 'Back',
      action() {
        tour.back();
      }
    });
  }
  buttons.push({
    text: 'Skip',
    classes: 'shepherd-button-secondary',
    action() {
      tour.cancel();
    }
  });
  if (index === totalSteps - 1) {
    buttons.push({
      text: 'Done',
      action() {
        tour.complete();
      }
    });
  } else {
    buttons.push({
      text: 'Next',
      action() {
        tour.next();
      }
    });
  }
  return buttons;
}

export function setupPageTour(pageKey, {
  steps = [],
  onBeforeStart,
  onAfterComplete,
  onAfterCancel
} = {}) {
  if (!pageKey) {
    throw new Error('setupPageTour requires a pageKey.');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      startTour: () => false,
      resetTour: () => {},
      refreshHelpState: () => {}
    };
  }

  const STEP_KEY = `${pageKey}.tour.step`;
  const COMPLETE_KEY = `${pageKey}.tour.complete`;
  let tourInstance = null;
  let activeStepId = null;
  let startContext = null;

  function refreshHelpState() {
    if (typeof window === 'undefined' || typeof window.setHelpGuideState !== 'function') return;
    const storage = getStorage();
    const storedStep = storage ? storage.getItem(STEP_KEY) : null;
    const completed = storage ? storage.getItem(COMPLETE_KEY) === 'true' : false;
    let mode = 'start';
    if (storedStep) mode = 'resume';
    else if (completed) mode = 'replay';
    window.setHelpGuideState({ mode, completed });
  }

  function ensureTour() {
    if (tourInstance) return tourInstance;
    if (typeof window === 'undefined' || !window.Shepherd) return null;
    const tour = new window.Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        classes: 'glass card text-sm leading-relaxed shadow-xl max-w-md',
        scrollTo: { behavior: 'smooth', block: 'center' }
      }
    });

    steps.forEach((step, index) => {
      const config = { ...step };
      if (!config.id) config.id = `${pageKey}-step-${index + 1}`;
      if (!config.buttons) {
        config.buttons = createDefaultButtons(tour, index, steps.length);
      }
      tour.addStep(config);
    });

    tour.on('show', () => {
      const current = tour.currentStep;
      activeStepId = current?.id || null;
      if (activeStepId) {
        const storage = getStorage();
        if (storage) {
          storage.setItem(STEP_KEY, activeStepId);
          storage.removeItem(COMPLETE_KEY);
        }
      }
      refreshHelpState();
    });

    tour.on('complete', () => {
      activeStepId = null;
      const storage = getStorage();
      if (storage) {
        storage.removeItem(STEP_KEY);
        storage.setItem(COMPLETE_KEY, 'true');
      }
      refreshHelpState();
      if (typeof window.trackEvent === 'function') {
        window.trackEvent('tour_complete', { page: pageKey });
      }
      if (typeof onAfterComplete === 'function') {
        try {
          onAfterComplete({ tour, context: startContext });
        } catch (err) {
          console.error('Tour onAfterComplete failed', err);
        }
      }
      startContext = null;
    });

    tour.on('cancel', () => {
      if (activeStepId) {
        const storage = getStorage();
        if (storage) {
          storage.setItem(STEP_KEY, activeStepId);
        }
      }
      refreshHelpState();
      if (typeof onAfterCancel === 'function') {
        try {
          onAfterCancel({ tour, context: startContext, reason: 'cancel' });
        } catch (err) {
          console.error('Tour onAfterCancel failed', err);
        }
      }
      startContext = null;
    });

    tour.on('inactive', () => {
      activeStepId = null;
    });

    tourInstance = tour;
    return tourInstance;
  }

  async function startTour({ resume = false } = {}) {
    if (typeof onBeforeStart === 'function') {
      try {
        startContext = await onBeforeStart({ resume });
      } catch (err) {
        console.error('Tour onBeforeStart failed', err);
        startContext = null;
      }
    } else {
      startContext = null;
    }

    const shepherd = await waitForShepherd();
    if (!shepherd) {
      if (typeof onAfterCancel === 'function') {
        try {
          onAfterCancel({ context: startContext, reason: 'unavailable' });
        } catch (err) {
          console.error('Tour onAfterCancel failed', err);
        }
      }
      startContext = null;
      return false;
    }

    const tour = ensureTour();
    if (!tour) {
      if (typeof onAfterCancel === 'function') {
        try {
          onAfterCancel({ context: startContext, reason: 'unavailable' });
        } catch (err) {
          console.error('Tour onAfterCancel failed', err);
        }
      }
      startContext = null;
      return false;
    }

    if (typeof tour.isActive === 'function' && tour.isActive()) {
      tour.cancel();
    }

    if (typeof window.trackEvent === 'function') {
      window.trackEvent('tour_start', { page: pageKey, resume });
    }

    if (resume) {
      const storage = getStorage();
      const stepId = storage ? storage.getItem(STEP_KEY) : null;
      if (storage) {
        storage.removeItem(COMPLETE_KEY);
      }
      refreshHelpState();
      tour.start();
      if (stepId && tour.getById(stepId)) {
        tour.show(stepId);
      }
    } else {
      activeStepId = null;
      const storage = getStorage();
      if (storage) {
        storage.removeItem(STEP_KEY);
        storage.removeItem(COMPLETE_KEY);
      }
      refreshHelpState();
      tour.start();
    }

    return true;
  }

  function resetTour() {
    if (tourInstance && typeof tourInstance.cancel === 'function') {
      tourInstance.cancel();
    }
    activeStepId = null;
    const storage = getStorage();
    if (storage) {
      storage.removeItem(STEP_KEY);
      storage.removeItem(COMPLETE_KEY);
    }
    refreshHelpState();
    if (typeof onAfterCancel === 'function') {
      try {
        onAfterCancel({ tour: tourInstance, context: startContext, reason: 'reset' });
      } catch (err) {
        console.error('Tour onAfterCancel failed', err);
      }
    }
    startContext = null;
  }

  const handleTutorialRequest = (event) => {
    const mode = event?.detail?.mode || 'start';
    if (mode === 'resume') startTour({ resume: true });
    else startTour({ resume: false });
  };

  const handleTutorialReset = () => {
    resetTour();
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('crm:tutorial-request', handleTutorialRequest);
    window.addEventListener('crm:tutorial-reset', handleTutorialReset);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshHelpState, { once: true });
    } else {
      refreshHelpState();
    }
  }

  return { startTour, resetTour, refreshHelpState };
}
