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
    const storedStep = window.localStorage.getItem(STEP_KEY);
    const completed = window.localStorage.getItem(COMPLETE_KEY) === 'true';
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
        window.localStorage.setItem(STEP_KEY, activeStepId);
        window.localStorage.removeItem(COMPLETE_KEY);
      }
      refreshHelpState();
    });

    tour.on('complete', () => {
      activeStepId = null;
      window.localStorage.removeItem(STEP_KEY);
      window.localStorage.setItem(COMPLETE_KEY, 'true');
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
        window.localStorage.setItem(STEP_KEY, activeStepId);
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
      const stepId = window.localStorage.getItem(STEP_KEY);
      window.localStorage.removeItem(COMPLETE_KEY);
      refreshHelpState();
      tour.start();
      if (stepId && tour.getById(stepId)) {
        tour.show(stepId);
      }
    } else {
      activeStepId = null;
      window.localStorage.removeItem(STEP_KEY);
      window.localStorage.removeItem(COMPLETE_KEY);
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
    window.localStorage.removeItem(STEP_KEY);
    window.localStorage.removeItem(COMPLETE_KEY);
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

  if (
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    window.addEventListener('crm:tutorial-request', handleTutorialRequest);
    window.addEventListener('crm:tutorial-reset', handleTutorialReset);
  }

  if (
    typeof document !== 'undefined' &&
    typeof document.addEventListener === 'function'
  ) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshHelpState, { once: true });
    } else {
      refreshHelpState();
    }
  } else if (typeof window === 'undefined') {
    // Non-DOM environments (tests) can still mark the help state immediately.
    refreshHelpState();
  }

  return { startTour, resetTour, refreshHelpState };
}
