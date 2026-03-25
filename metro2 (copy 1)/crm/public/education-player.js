(function(){
  'use strict';

  var _portalCid = (function() {
    try {
      // Match both /portal/:id and /client-portal/:id routes
      var m = location.pathname.match(/\/(?:client-)?portal\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch { return ''; }
  })();

  function _eduKey(base) { return _portalCid ? base + '_' + _portalCid : base; }

  var EDU_STORAGE_KEY = _eduKey('edu_progress');
  var EDU_STREAK_KEY  = _eduKey('edu_streak');
  var EDU_TIER_KEY    = _eduKey('edu_active_tier');
  var EDU_QUIZ_KEY    = _eduKey('edu_quiz_progress');
  var XP_PER_LESSON = 100;

  // Migrate legacy flat-key data to namespaced keys on first load.
  // education-player.js may execute before client-portal.js (deferred script order),
  // so we read the legacy 'clientId' flat key directly from localStorage to detect
  // whose data the flat edu keys belong to. If client-portal.js already ran first,
  // it removes 'clientId' and sets window.__PORTAL_PREV_CLIENT_ID__; we use that as fallback.
  if (_portalCid) {
    try {
      var _legacyKeys = { 'edu_progress': EDU_STORAGE_KEY, 'edu_streak': EDU_STREAK_KEY, 'edu_active_tier': EDU_TIER_KEY, 'edu_quiz_progress': EDU_QUIZ_KEY };
      // Prefer the live localStorage value (if edu-player runs before client-portal.js);
      // fall back to the window variable set by client-portal.js if it ran first.
      var _prevCid = localStorage.getItem('clientId');
      if (_prevCid === null && typeof window.__PORTAL_PREV_CLIENT_ID__ !== 'undefined') {
        _prevCid = window.__PORTAL_PREV_CLIENT_ID__;
      }
      var _eduFlatsBelongHere = (_prevCid === null || _prevCid === _portalCid);
      Object.keys(_legacyKeys).forEach(function(flat) {
        var ns = _legacyKeys[flat];
        if (flat !== ns) {
          var legacyVal = localStorage.getItem(flat);
          if (legacyVal !== null) {
            // Only migrate if flat key belongs to the current client; otherwise purge
            if (_eduFlatsBelongHere && localStorage.getItem(ns) === null) {
              localStorage.setItem(ns, legacyVal);
            }
            localStorage.removeItem(flat);
          }
        }
      });
    } catch {}
  }

  function getProgress(){
    try {
      return JSON.parse(localStorage.getItem(EDU_STORAGE_KEY) || '{}');
    } catch { return {}; }
  }

  function saveProgress(p){
    try { localStorage.setItem(EDU_STORAGE_KEY, JSON.stringify(p)); } catch {}
  }

  function getLessonStatus(lessonId){
    var p = getProgress();
    if(p[lessonId] && p[lessonId].completed) return 'completed';
    return null;
  }

  function completeLessonProgress(lessonId){
    var p = getProgress();
    if(!p[lessonId]) p[lessonId] = {};
    p[lessonId].completed = true;
    p[lessonId].completedAt = Date.now();
    saveProgress(p);
  }

  function getAllLessons(){
    var all = [];
    if(window.EDUCATION_LESSONS) all = all.concat(window.EDUCATION_LESSONS);
    if(window.EDUCATION_INTERMEDIATE) all = all.concat(window.EDUCATION_INTERMEDIATE);
    if(window.EDUCATION_EXPERT) all = all.concat(window.EDUCATION_EXPERT);
    return all;
  }

  function isQuizKey(key){ return key.indexOf('_quiz_') === 0; }

  function getTotalXP(){
    var p = getProgress();
    var all = getAllLessons();
    var xp = 0;
    for(var key in p){
      if(isQuizKey(key)) continue;
      if(p[key] && p[key].completed){
        var lesson = all.find(function(l){ return l.id === key; });
        xp += (lesson && lesson.xp) ? lesson.xp : XP_PER_LESSON;
      }
    }
    return xp;
  }

  function getCompletedCount(){
    var p = getProgress();
    var count = 0;
    for(var key in p){ if(!isQuizKey(key) && p[key] && p[key].completed) count++; }
    return count;
  }

  function getCompletedCountForTier(tierLessons){
    var p = getProgress();
    var count = 0;
    tierLessons.forEach(function(l){ if(p[l.id] && p[l.id].completed) count++; });
    return count;
  }

  function getStreak(){
    try {
      var raw = localStorage.getItem(EDU_STREAK_KEY);
      if(!raw) return { days: 0, lastDate: null };
      return JSON.parse(raw);
    } catch { return { days: 0, lastDate: null }; }
  }

  function updateStreak(){
    var streak = getStreak();
    var today = new Date().toISOString().slice(0,10);
    if(streak.lastDate === today) return streak;
    var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if(streak.lastDate === yesterday){
      streak.days++;
    } else {
      streak.days = 1;
    }
    streak.lastDate = today;
    try { localStorage.setItem(EDU_STREAK_KEY, JSON.stringify(streak)); } catch {}
    return streak;
  }

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }

  function resolveStatuses(lessons){
    var foundFirst = false;
    return lessons.map(function(l){
      if(getLessonStatus(l.id) === 'completed') return 'completed';
      if(!foundFirst){ foundFirst = true; return 'current'; }
      return 'locked';
    });
  }

  function getActiveTier(){
    try { return localStorage.getItem(EDU_TIER_KEY) || 'beginner'; } catch { return 'beginner'; }
  }

  function setActiveTier(tier){
    try { localStorage.setItem(EDU_TIER_KEY, tier); } catch {}
  }

  function renderMeter(visual){
    var html = '<div class="lesson-meter">';
    html += '<div class="lesson-meter-label">' + esc(visual.label) + '</div>';
    html += '<div class="lesson-meter-bar">';
    visual.ranges.forEach(function(r){
      var widthPct = ((r.max - r.min) / (850 - 300)) * 100;
      html += '<div class="lesson-meter-seg" style="width:' + widthPct + '%;background:' + r.color + '">';
      html += '<span class="lesson-meter-seg-label">' + esc(r.label) + '</span>';
      html += '<span class="lesson-meter-seg-range">' + r.min + '-' + r.max + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderBreakdown(visual){
    var html = '<div class="lesson-breakdown">';
    visual.items.forEach(function(item){
      html += '<div class="lesson-breakdown-row">';
      html += '<div class="lesson-breakdown-bar-wrap">';
      html += '<div class="lesson-breakdown-label">' + esc(item.label) + ' <span class="lesson-breakdown-pct">' + item.pct + '%</span></div>';
      html += '<div class="lesson-breakdown-track"><div class="lesson-breakdown-fill" style="width:' + item.pct + '%;background:' + item.color + '"></div></div>';
      html += '</div>';
      html += '<div class="lesson-breakdown-desc">' + esc(item.desc) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderCards(visual){
    var html = '<div class="lesson-cards-grid">';
    visual.items.forEach(function(c){
      html += '<div class="lesson-info-card">';
      html += '<div class="lesson-info-card-icon">' + c.icon + '</div>';
      html += '<div class="lesson-info-card-title">' + esc(c.title) + '</div>';
      html += '<div class="lesson-info-card-desc">' + esc(c.desc) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderSteps(visual){
    var html = '<div class="lesson-steps-list">';
    visual.items.forEach(function(s, i){
      html += '<div class="lesson-step-item">';
      html += '<div class="lesson-step-num">' + (i + 1) + '</div>';
      html += '<div class="lesson-step-body">';
      html += '<div class="lesson-step-title">' + esc(s.title) + '</div>';
      html += '<div class="lesson-step-desc">' + esc(s.desc) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderTimeline(visual){
    var html = '<div class="lesson-timeline">';
    visual.items.forEach(function(t){
      var sevClass = 'severity-' + (t.severity || 'medium');
      html += '<div class="lesson-timeline-item ' + sevClass + '">';
      html += '<div class="lesson-timeline-dot"></div>';
      html += '<div class="lesson-timeline-content">';
      html += '<div class="lesson-timeline-head">';
      html += '<span class="lesson-timeline-label">' + esc(t.label) + '</span>';
      html += '<span class="lesson-timeline-duration">' + esc(t.duration) + '</span>';
      html += '</div>';
      html += '<div class="lesson-timeline-desc">' + esc(t.desc) + '</div>';
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderTip(visual){
    return '<div class="lesson-tip"><div class="lesson-tip-icon">💡</div><div class="lesson-tip-text">' + esc(visual.text) + '</div></div>';
  }

  function renderVisual(visual){
    if(!visual) return '';
    switch(visual.type){
      case 'meter': return renderMeter(visual);
      case 'breakdown': return renderBreakdown(visual);
      case 'cards': return renderCards(visual);
      case 'steps': return renderSteps(visual);
      case 'timeline': return renderTimeline(visual);
      case 'tip': return renderTip(visual);
      default: return '';
    }
  }

  function createOverlay(){
    var existing = document.getElementById('lessonPlayerOverlay');
    if(existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'lessonPlayerOverlay';
    overlay.className = 'lesson-overlay';
    document.body.appendChild(overlay);
    return overlay;
  }

  function openLesson(lessonId){
    var all = getAllLessons();
    var lesson = null;
    for(var i = 0; i < all.length; i++){
      if(all[i].id === lessonId){ lesson = all[i]; break; }
    }
    if(!lesson) return;

    var lessonXP = lesson.xp || XP_PER_LESSON;
    var overlay = createOverlay();
    var currentStep = 0;
    var answered = {};
    var totalSections = lesson.sections.length;

    function render(){
      var section = lesson.sections[currentStep];
      var progressPct = ((currentStep + 1) / totalSections) * 100;

      var tierLabel = '';
      if(lesson.tier === 'intermediate') tierLabel = '<span class="lesson-tier-badge tier-intermediate">Intermediate</span>';
      else if(lesson.tier === 'expert') tierLabel = '<span class="lesson-tier-badge tier-expert">Expert</span>';

      var html = '<div class="lesson-player">';
      html += '<div class="lesson-player-header">';
      html += '<button class="lesson-close-btn" id="lessonClose" type="button" aria-label="Close">';
      html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      html += '</button>';
      html += '<div class="lesson-header-info">';
      html += '<div class="lesson-header-title">' + tierLabel + esc(lesson.title) + '</div>';
      html += '<div class="lesson-header-step">Step ' + (currentStep + 1) + ' of ' + totalSections + '</div>';
      html += '</div>';
      html += '<div class="lesson-progress-bar"><div class="lesson-progress-fill" style="width:' + progressPct + '%"></div></div>';
      html += '</div>';

      html += '<div class="lesson-player-body">';

      if(section.type === 'content'){
        html += '<h2 class="lesson-section-title">' + esc(section.title) + '</h2>';
        html += '<div class="lesson-section-body">' + formatBody(section.body) + '</div>';
        if(section.visual) html += renderVisual(section.visual);
      } else if(section.type === 'scenario' || section.type === 'multiple-choice' || section.type === 'true-false'){
        var badgeText = section.type === 'true-false' ? '✅ True or False' : section.type === 'multiple-choice' ? '❓ Question' : '📋 Scenario';
        html += '<div class="lesson-scenario">';
        html += '<div class="lesson-scenario-badge">' + badgeText + '</div>';
        html += '<h2 class="lesson-section-title">' + esc(section.title) + '</h2>';
        if(section.story) html += '<div class="lesson-scenario-story">' + formatBody(section.story) + '</div>';
        html += '<div class="lesson-scenario-question">' + esc(section.question) + '</div>';
        html += '<div class="lesson-options" id="lessonOptions">';
        section.options.forEach(function(opt, oi){
          var isAnswered = answered[currentStep] !== undefined;
          var isSelected = answered[currentStep] === oi;
          var optClass = 'lesson-option';
          if(isAnswered){
            if(opt.correct) optClass += ' correct';
            else if(isSelected) optClass += ' incorrect';
            else optClass += ' dimmed';
          }
          html += '<button class="' + optClass + '" data-oi="' + oi + '" type="button"' + (isAnswered ? ' disabled' : '') + '>';
          html += '<span class="lesson-option-letter">' + String.fromCharCode(65 + oi) + '</span>';
          html += '<span class="lesson-option-text">' + esc(opt.text) + '</span>';
          if(isAnswered && (opt.correct || isSelected)){
            html += '<span class="lesson-option-icon">' + (opt.correct ? '✓' : '✗') + '</span>';
          }
          html += '</button>';
        });
        html += '</div>';
        if(answered[currentStep] !== undefined){
          var chosenOpt = section.options[answered[currentStep]];
          var feedbackClass = chosenOpt.correct ? 'correct' : 'incorrect';
          html += '<div class="lesson-feedback ' + feedbackClass + '">';
          html += '<div class="lesson-feedback-header">' + (chosenOpt.correct ? '✅ Correct!' : '❌ Not quite') + '</div>';
          html += '<div class="lesson-feedback-text">' + esc(chosenOpt.explanation) + '</div>';
          html += '</div>';
        }
        html += '</div>';
      }

      html += '</div>';

      html += '<div class="lesson-player-footer">';
      if(currentStep > 0){
        html += '<button class="lesson-btn lesson-btn-back" id="lessonBack" type="button">← Back</button>';
      } else {
        html += '<div></div>';
      }
      var canProceed = section.type === 'content' || answered[currentStep] !== undefined;
      if(currentStep < totalSections - 1){
        html += '<button class="lesson-btn lesson-btn-next' + (!canProceed ? ' disabled' : '') + '" id="lessonNext" type="button"' + (!canProceed ? ' disabled' : '') + '>Next →</button>';
      } else {
        html += '<button class="lesson-btn lesson-btn-complete' + (!canProceed ? ' disabled' : '') + '" id="lessonComplete" type="button"' + (!canProceed ? ' disabled' : '') + '>Complete Lesson 🎉</button>';
      }
      html += '</div>';
      html += '</div>';

      overlay.innerHTML = html;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      overlay.querySelector('#lessonClose').addEventListener('click', closeLesson);
      var backBtn = overlay.querySelector('#lessonBack');
      if(backBtn) backBtn.addEventListener('click', function(){ currentStep--; render(); });
      var nextBtn = overlay.querySelector('#lessonNext');
      if(nextBtn && canProceed) nextBtn.addEventListener('click', function(){ currentStep++; render(); });
      var completeBtn = overlay.querySelector('#lessonComplete');
      if(completeBtn && canProceed) completeBtn.addEventListener('click', function(){ handleComplete(); });

      if((section.type === 'scenario' || section.type === 'multiple-choice' || section.type === 'true-false') && answered[currentStep] === undefined){
        overlay.querySelectorAll('.lesson-option').forEach(function(btn){
          btn.addEventListener('click', function(){
            var oi = parseInt(btn.getAttribute('data-oi'));
            answered[currentStep] = oi;
            render();
          });
        });
      }

      var body = overlay.querySelector('.lesson-player-body');
      if(body) body.scrollTop = 0;

      setTimeout(function(){
        var fills = overlay.querySelectorAll('.lesson-breakdown-fill');
        fills.forEach(function(f){ f.style.transition = 'width 0.8s ease'; });
      }, 100);
    }

    function handleComplete(){
      completeLessonProgress(lessonId);
      updateStreak();
      showCompletionScreen();
    }

    function showCompletionScreen(){
      var xp = getTotalXP();
      var completed = getCompletedCount();
      var total = getAllLessons().length;
      var streak = getStreak();
      var level = Math.floor(xp / 800) + 1;

      var html = '<div class="lesson-player">';
      html += '<div class="lesson-completion">';
      html += '<div class="lesson-completion-burst"></div>';
      html += '<div class="lesson-completion-icon">🎉</div>';
      html += '<h2 class="lesson-completion-title">Lesson Complete!</h2>';
      html += '<p class="lesson-completion-subtitle">' + esc(lesson.title) + '</p>';
      html += '<div class="lesson-completion-stats">';
      html += '<div class="lesson-stat"><div class="lesson-stat-value">+' + lessonXP + '</div><div class="lesson-stat-label">XP Earned</div></div>';
      html += '<div class="lesson-stat"><div class="lesson-stat-value">' + streak.days + '</div><div class="lesson-stat-label">Day Streak 🔥</div></div>';
      html += '<div class="lesson-stat"><div class="lesson-stat-value">' + completed + '/' + total + '</div><div class="lesson-stat-label">Complete</div></div>';
      html += '</div>';
      html += '<div class="lesson-completion-xp">';
      html += '<div class="lesson-completion-level">Level ' + level + '</div>';
      html += '<div class="lesson-completion-xp-text">' + xp + ' / ' + (level * 800) + ' XP</div>';
      html += '<div class="edu-xp-track"><div class="edu-xp-fill" style="width:' + ((xp % 800) / 800 * 100) + '%"></div></div>';
      html += '</div>';
      html += '<button class="lesson-btn lesson-btn-complete" id="lessonDone" type="button">Continue</button>';
      html += '</div>';
      html += '</div>';

      overlay.innerHTML = html;
      overlay.querySelector('#lessonDone').addEventListener('click', function(){
        closeLesson();
        if(typeof window.refreshEducation === 'function') window.refreshEducation();
      });
    }

    function closeLesson(){
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function(){ overlay.remove(); }, 300);
      if(typeof window.refreshEducation === 'function') window.refreshEducation();
    }

    render();
  }

  function formatBody(text){
    if(!text) return '';
    var s = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    s = s.replace(/&lt;strong&gt;/g,'<strong>').replace(/&lt;\/strong&gt;/g,'</strong>');
    s = s.replace(/\n\n/g, '</p><p>').replace(/\n•/g, '<br>•').replace(/\n/g, '<br>');
    return '<p>' + s + '</p>';
  }

  function getQuizProgress(){
    try { return JSON.parse(localStorage.getItem(EDU_QUIZ_KEY) || '{}'); } catch { return {}; }
  }

  function saveQuizProgress(qp){
    try { localStorage.setItem(EDU_QUIZ_KEY, JSON.stringify(qp)); } catch {}
  }

  function isTierComplete(tierKey){
    var tierData = getTierData(tierKey);
    if(!tierData || !tierData.length) return false;
    var p = getProgress();
    for(var i = 0; i < tierData.length; i++){
      if(!p[tierData[i].id] || !p[tierData[i].id].completed) return false;
    }
    return true;
  }

  function isTierQuizPassed(tierKey){
    var qp = getQuizProgress();
    return qp[tierKey] && qp[tierKey].passed;
  }

  function getTierData(tierKey){
    if(tierKey === 'beginner') return window.EDUCATION_LESSONS || [];
    if(tierKey === 'intermediate') return window.EDUCATION_INTERMEDIATE || [];
    if(tierKey === 'expert') return window.EDUCATION_EXPERT || [];
    return [];
  }

  function _shuffleArr(arr){
    for(var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function buildQuizQuestions(tierKey){
    var tierData = getTierData(tierKey);
    var scenarios = [];
    var direct = [];
    tierData.forEach(function(lesson){
      if(!lesson.sections) return;
      lesson.sections.forEach(function(sec){
        if(sec.type === 'scenario'){
          scenarios.push({ lessonTitle: lesson.title, title: sec.title, question: sec.question, options: sec.options, story: sec.story, type: 'scenario' });
        } else if(sec.type === 'multiple-choice' || sec.type === 'true-false'){
          direct.push({ lessonTitle: lesson.title, title: sec.title, question: sec.question, options: sec.options, type: sec.type });
        }
      });
    });
    _shuffleArr(scenarios);
    _shuffleArr(direct);
    var quizSize = { beginner: 8, intermediate: 5, expert: 5 };
    var count = quizSize[tierKey] || 5;
    var scenarioCount = Math.max(1, Math.round(count * 0.2));
    var directCount = count - scenarioCount;
    var selected = scenarios.slice(0, Math.min(scenarioCount, scenarios.length))
      .concat(direct.slice(0, Math.min(directCount, direct.length)));
    _shuffleArr(selected);
    return selected.slice(0, count);
  }

  var QUIZ_TIME_LIMITS = { beginner: 600, intermediate: 480, expert: 420 };
  var QUIZ_PASS_SCORES = { beginner: 0.7, intermediate: 0.75, expert: 0.8 };
  var QUIZ_BONUS_XP = { beginner: 300, intermediate: 500, expert: 800 };

  function openTierQuiz(tierKey){
    if(!isTierComplete(tierKey)) return;
    var questions = buildQuizQuestions(tierKey);
    if(!questions.length) return;

    var overlay = createOverlay();
    var currentQ = 0;
    var answers = {};
    var timeLimit = QUIZ_TIME_LIMITS[tierKey] || 480;
    var timeLeft = timeLimit;
    var timer = null;
    var quizFinished = false;
    var tierLabels = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
    var tierColors = { beginner: '#22c55e', intermediate: '#f59e0b', expert: '#ef4444' };

    function startTimer(){
      timer = setInterval(function(){
        timeLeft--;
        var el = overlay.querySelector('#quizTimer');
        if(el) el.textContent = formatTime(timeLeft);
        if(timeLeft <= 60){
          var tw = overlay.querySelector('.quiz-timer');
          if(tw) tw.classList.add('warning');
        }
        if(timeLeft <= 0){
          clearInterval(timer);
          finishQuiz();
        }
      }, 1000);
    }

    function formatTime(s){
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function renderQuestion(){
      if(quizFinished) return;
      var q = questions[currentQ];
      var progressPct = ((currentQ + 1) / questions.length) * 100;

      var html = '<div class="lesson-player quiz-player">';
      html += '<div class="lesson-player-header quiz-header">';
      html += '<button class="lesson-close-btn" id="quizClose" type="button" aria-label="Close">';
      html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      html += '</button>';
      html += '<div class="lesson-header-info">';
      html += '<div class="lesson-header-title"><span class="lesson-tier-badge" style="background:' + tierColors[tierKey] + '20;color:' + tierColors[tierKey] + '">' + tierLabels[tierKey] + ' Final Exam</span></div>';
      html += '<div class="lesson-header-step">Question ' + (currentQ + 1) + ' of ' + questions.length + '</div>';
      html += '</div>';
      html += '<div class="quiz-timer' + (timeLeft <= 60 ? ' warning' : '') + '"><span class="quiz-timer-icon">⏱</span><span id="quizTimer">' + formatTime(timeLeft) + '</span></div>';
      html += '<div class="lesson-progress-bar"><div class="lesson-progress-fill" style="width:' + progressPct + '%;background:' + tierColors[tierKey] + '"></div></div>';
      html += '</div>';

      html += '<div class="lesson-player-body">';
      html += '<div class="lesson-scenario">';
      var qBadge = q.type === 'true-false' ? '✅ True or False' : q.type === 'multiple-choice' ? '❓ Question' : '📝 Exam Question';
      html += '<div class="lesson-scenario-badge">' + qBadge + '</div>';
      html += '<h2 class="lesson-section-title">' + esc(q.title) + '</h2>';
      if(q.story) html += '<div class="lesson-scenario-story">' + formatBody(q.story) + '</div>';
      html += '<div class="lesson-scenario-question">' + esc(q.question) + '</div>';
      html += '<div class="lesson-options" id="quizOptions">';
      q.options.forEach(function(opt, oi){
        var isAnswered = answers[currentQ] !== undefined;
        var isSelected = answers[currentQ] === oi;
        var optClass = 'lesson-option';
        if(isAnswered){
          if(opt.correct) optClass += ' correct';
          else if(isSelected) optClass += ' incorrect';
          else optClass += ' dimmed';
        }
        html += '<button class="' + optClass + '" data-oi="' + oi + '" type="button"' + (isAnswered ? ' disabled' : '') + '>';
        html += '<span class="lesson-option-letter">' + String.fromCharCode(65 + oi) + '</span>';
        html += '<span class="lesson-option-text">' + esc(opt.text) + '</span>';
        if(isAnswered && (opt.correct || isSelected)){
          html += '<span class="lesson-option-icon">' + (opt.correct ? '✓' : '✗') + '</span>';
        }
        html += '</button>';
      });
      html += '</div>';
      if(answers[currentQ] !== undefined){
        var chosen = q.options[answers[currentQ]];
        var fbClass = chosen.correct ? 'correct' : 'incorrect';
        html += '<div class="lesson-feedback ' + fbClass + '">';
        html += '<div class="lesson-feedback-header">' + (chosen.correct ? '✅ Correct!' : '❌ Not quite') + '</div>';
        html += '<div class="lesson-feedback-text">' + esc(chosen.explanation) + '</div>';
        html += '</div>';
      }
      html += '</div></div>';

      html += '<div class="lesson-player-footer">';
      if(currentQ > 0){
        html += '<button class="lesson-btn lesson-btn-back" id="quizBack" type="button">← Back</button>';
      } else { html += '<div></div>'; }
      var canProceed = answers[currentQ] !== undefined;
      if(currentQ < questions.length - 1){
        html += '<button class="lesson-btn lesson-btn-next' + (!canProceed ? ' disabled' : '') + '" id="quizNext" type="button"' + (!canProceed ? ' disabled' : '') + '>Next →</button>';
      } else {
        html += '<button class="lesson-btn lesson-btn-complete' + (!canProceed ? ' disabled' : '') + '" id="quizFinish" type="button"' + (!canProceed ? ' disabled' : '') + '>Finish Exam</button>';
      }
      html += '</div></div>';

      overlay.innerHTML = html;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      overlay.querySelector('#quizClose').addEventListener('click', function(){
        if(confirm('Are you sure you want to leave? Your progress will be lost.')) closeQuiz();
      });
      var backBtn = overlay.querySelector('#quizBack');
      if(backBtn) backBtn.addEventListener('click', function(){ currentQ--; renderQuestion(); });
      var nextBtn = overlay.querySelector('#quizNext');
      if(nextBtn && canProceed) nextBtn.addEventListener('click', function(){ currentQ++; renderQuestion(); });
      var finishBtn = overlay.querySelector('#quizFinish');
      if(finishBtn && canProceed) finishBtn.addEventListener('click', finishQuiz);

      if(answers[currentQ] === undefined){
        overlay.querySelectorAll('.lesson-option').forEach(function(btn){
          btn.addEventListener('click', function(){
            answers[currentQ] = parseInt(btn.getAttribute('data-oi'));
            renderQuestion();
          });
        });
      }

      var body = overlay.querySelector('.lesson-player-body');
      if(body) body.scrollTop = 0;
    }

    function finishQuiz(){
      quizFinished = true;
      if(timer) clearInterval(timer);

      var correct = 0;
      var total = questions.length;
      for(var i = 0; i < total; i++){
        if(answers[i] !== undefined){
          var q = questions[i];
          if(q.options[answers[i]] && q.options[answers[i]].correct) correct++;
        }
      }

      var pct = total > 0 ? correct / total : 0;
      var passThreshold = QUIZ_PASS_SCORES[tierKey] || 0.75;
      var passed = pct >= passThreshold;
      var bonusXP = passed ? (QUIZ_BONUS_XP[tierKey] || 300) : 0;

      if(passed){
        var qp = getQuizProgress();
        qp[tierKey] = { passed: true, score: correct, total: total, pct: Math.round(pct * 100), bonusXP: bonusXP, completedAt: Date.now() };
        saveQuizProgress(qp);
        var p = getProgress();
        var quizKey = '_quiz_' + tierKey;
        if(!p[quizKey]) p[quizKey] = {};
        p[quizKey].completed = true;
        p[quizKey].completedAt = Date.now();
        p[quizKey].bonusXP = bonusXP;
        saveProgress(p);
      }

      var timeTaken = timeLimit - timeLeft;
      var resultIcon = passed ? '🎓' : '📝';
      var resultTitle = passed ? 'Exam Passed!' : 'Keep Studying';
      var resultColor = passed ? '#22c55e' : '#f59e0b';

      var html = '<div class="lesson-player quiz-player">';
      html += '<div class="lesson-completion quiz-result">';
      html += '<div class="lesson-completion-burst" style="background:radial-gradient(circle, ' + resultColor + '22 0%, transparent 70%)"></div>';
      html += '<div class="lesson-completion-icon">' + resultIcon + '</div>';
      html += '<h2 class="lesson-completion-title" style="color:' + resultColor + '">' + resultTitle + '</h2>';
      html += '<p class="lesson-completion-subtitle">' + esc(tierLabels[tierKey]) + ' Final Exam</p>';
      html += '<div class="quiz-result-score">';
      html += '<div class="quiz-score-circle" style="--score-pct:' + Math.round(pct * 100) + '%;--score-color:' + resultColor + '">';
      html += '<span class="quiz-score-num">' + Math.round(pct * 100) + '%</span>';
      html += '</div>';
      html += '<div class="quiz-score-detail">' + correct + ' of ' + total + ' correct</div>';
      html += '<div class="quiz-score-time">Time: ' + formatTime(timeTaken) + '</div>';
      html += '<div class="quiz-score-threshold">Passing: ' + Math.round(passThreshold * 100) + '%</div>';
      html += '</div>';

      if(passed){
        html += '<div class="lesson-completion-stats">';
        html += '<div class="lesson-stat"><div class="lesson-stat-value">+' + bonusXP + '</div><div class="lesson-stat-label">Bonus XP</div></div>';
        html += '<div class="lesson-stat"><div class="lesson-stat-value">🎓</div><div class="lesson-stat-label">' + esc(tierLabels[tierKey]) + ' Graduate</div></div>';
        html += '</div>';
        html += '<div class="quiz-actions">';
        html += '<button class="lesson-btn lesson-btn-complete" id="quizCert" type="button">Download Certificate 📜</button>';
        html += '<button class="lesson-btn lesson-btn-next" id="quizDone" type="button">Continue</button>';
        html += '</div>';
      } else {
        html += '<div class="quiz-retry-msg">Review the lessons and try again. You need ' + Math.round(passThreshold * 100) + '% to pass.</div>';
        html += '<button class="lesson-btn lesson-btn-complete" id="quizDone" type="button">Back to Lessons</button>';
      }

      html += '</div></div>';

      overlay.innerHTML = html;

      var certBtn = overlay.querySelector('#quizCert');
      if(certBtn) certBtn.addEventListener('click', function(){ generateCertificate(tierKey); });
      overlay.querySelector('#quizDone').addEventListener('click', function(){
        closeQuiz();
        if(typeof window.refreshEducation === 'function') window.refreshEducation();
      });
    }

    function closeQuiz(){
      if(timer) clearInterval(timer);
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function(){ overlay.remove(); }, 300);
      if(typeof window.refreshEducation === 'function') window.refreshEducation();
    }

    startTimer();
    renderQuestion();
  }

  function generateCertificate(tierKey){
    var tierLabels = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
    var tierColors = { beginner: '#22c55e', intermediate: '#f59e0b', expert: '#ef4444' };
    var qp = getQuizProgress();
    var quizData = qp[tierKey];
    if(!quizData || !quizData.passed) return;

    var completedDate = new Date(quizData.completedAt);
    var dateStr = completedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var userName = 'Credit Education Graduate';
    try {
      var portalUser = JSON.parse(localStorage.getItem('portal_user') || '{}');
      if(portalUser.first_name) userName = portalUser.first_name + (portalUser.last_name ? ' ' + portalUser.last_name : '');
      else if(portalUser.name) userName = portalUser.name;
    } catch {}

    var canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 850;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 1200, 850);

    ctx.strokeStyle = '#d4a853';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 1140, 790);
    ctx.strokeStyle = '#d4a85366';
    ctx.lineWidth = 1;
    ctx.strokeRect(45, 45, 1110, 760);

    for(var ci = 0; ci < 4; ci++){
      var cx = [60, 1140, 60, 1140][ci];
      var cy = [60, 60, 790, 790][ci];
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#d4a853';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
    }

    ctx.fillStyle = '#d4a853';
    ctx.font = '16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('EVOLV CREDIT EDUCATION ACADEMY', 600, 110);

    ctx.fillStyle = '#ffffff';
    ctx.font = '42px Georgia, serif';
    ctx.fillText('Certificate of Completion', 600, 175);

    ctx.fillStyle = '#999';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText('This certifies that', 600, 240);

    ctx.fillStyle = '#d4a853';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText(userName, 600, 295);

    ctx.strokeStyle = '#d4a85366';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(250, 310);
    ctx.lineTo(950, 310);
    ctx.stroke();

    ctx.fillStyle = '#ccc';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText('has successfully completed the', 600, 360);

    var tierColor = tierColors[tierKey];
    ctx.fillStyle = tierColor;
    ctx.font = 'bold 38px Georgia, serif';
    ctx.fillText(tierLabels[tierKey] + ' Tier', 600, 415);

    ctx.fillStyle = '#ccc';
    ctx.font = '18px Arial, sans-serif';
    ctx.fillText('Credit Education Program and passed the Final Examination', 600, 460);

    ctx.fillStyle = '#999';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText('Score: ' + quizData.pct + '% (' + quizData.score + '/' + quizData.total + ' correct)', 600, 510);

    ctx.font = '62px serif';
    ctx.fillText('🎓', 600, 590);

    ctx.fillStyle = '#d4a853';
    ctx.font = '14px Georgia, serif';
    ctx.fillText('EVOLV', 350, 700);
    ctx.strokeStyle = '#d4a85366';
    ctx.beginPath();
    ctx.moveTo(250, 710);
    ctx.lineTo(450, 710);
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('Evolv Credit Education', 350, 730);

    ctx.fillStyle = '#d4a853';
    ctx.font = '14px Georgia, serif';
    ctx.fillText(dateStr, 850, 700);
    ctx.strokeStyle = '#d4a85366';
    ctx.beginPath();
    ctx.moveTo(750, 710);
    ctx.lineTo(950, 710);
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('Date of Completion', 850, 730);

    ctx.fillStyle = '#33333366';
    ctx.font = '10px monospace';
    ctx.fillText('ID: EVOLV-' + tierKey.toUpperCase() + '-' + Date.now().toString(36).toUpperCase(), 600, 780);

    canvas.toBlob(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'Evolv_Certificate_' + tierLabels[tierKey] + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
    }, 'image/png');
  }

  function getTierQuizXP(){
    var qp = getQuizProgress();
    var total = 0;
    for(var key in qp){
      if(key.indexOf('beginner_test_') === 0) continue;
      if(qp[key] && qp[key].passed && qp[key].bonusXP) total += qp[key].bonusXP;
    }
    return total;
  }

  var origGetTotalXP = getTotalXP;
  getTotalXP = function(){
    return origGetTotalXP() + getTierQuizXP();
  };

  var BEGINNER_TESTS = [
    { index: 0, label: 'Test 1', subjects: ['negative-items', 'dispute-process'], names: ['Types of Negative Items', 'The Dispute Process'], count: 25 },
    { index: 1, label: 'Test 2', subjects: ['writing-disputes', 'building-credit'], names: ['Writing Effective Disputes', 'Building Positive Credit'], count: 25 },
    { index: 2, label: 'Test 3', subjects: ['advanced-strategies', 'maintaining-score'], names: ['Advanced Strategies', 'Maintaining Your Score'], count: 25 },
    { index: 3, label: 'Test 4', subjects: ['identity-theft-recovery', 'credit-building'], names: ['Identity Theft Recovery', 'Credit Building Strategies'], count: 25 }
  ];

  var BEGINNER_TEST_TIME = 900;
  var BEGINNER_TEST_PASS = 0.7;
  var BEGINNER_TEST_XP = 100;

  function getBeginnerTestProgress(){
    var qp = getQuizProgress();
    return {
      isTestPassed: function(idx){ var k = 'beginner_test_' + idx; return qp[k] && qp[k].passed; },
      saveTestResult: function(idx, result){
        var qp2 = getQuizProgress();
        qp2['beginner_test_' + idx] = result;
        saveQuizProgress(qp2);
        if(result.passed){
          var p = getProgress();
          var quizKey = '_quiz_beginner_test_' + idx;
          if(!p[quizKey]) p[quizKey] = {};
          p[quizKey].completed = true;
          p[quizKey].completedAt = Date.now();
          p[quizKey].bonusXP = BEGINNER_TEST_XP;
          saveProgress(p);
        }
      }
    };
  }

  function areTestLessonsComplete(subjects){
    var p = getProgress();
    for(var i = 0; i < subjects.length; i++){
      if(!p[subjects[i]] || !p[subjects[i]].completed) return false;
    }
    return true;
  }

  function buildTestQuestions(subjects, count){
    var lessons = window.EDUCATION_LESSONS || [];
    var scenarios = [];
    var direct = [];
    lessons.forEach(function(lesson){
      if(subjects.indexOf(lesson.id) === -1) return;
      if(!lesson.sections) return;
      lesson.sections.forEach(function(sec){
        if(sec.type === 'scenario'){
          scenarios.push({ lessonTitle: lesson.title, title: sec.title, question: sec.question, options: sec.options, story: sec.story, type: 'scenario' });
        } else if(sec.type === 'multiple-choice' || sec.type === 'true-false'){
          direct.push({ lessonTitle: lesson.title, title: sec.title, question: sec.question, options: sec.options, type: sec.type });
        }
      });
    });
    _shuffleArr(scenarios);
    _shuffleArr(direct);
    var scenarioCount = Math.max(1, Math.round(count * 0.2));
    var directCount = count - scenarioCount;
    var selected = scenarios.slice(0, Math.min(scenarioCount, scenarios.length))
      .concat(direct.slice(0, Math.min(directCount, direct.length)));
    _shuffleArr(selected);
    return selected.slice(0, count);
  }

  function openBeginnerTest(testIndex){
    var test = BEGINNER_TESTS[testIndex];
    if(!test) return;
    if(!areTestLessonsComplete(test.subjects)) return;

    var questions = buildTestQuestions(test.subjects, test.count);
    if(!questions.length) return;

    var overlay = createOverlay();
    var currentQ = 0;
    var answers = {};
    var timeLimit = BEGINNER_TEST_TIME;
    var timeLeft = timeLimit;
    var timer = null;
    var quizFinished = false;
    var testProgress = getBeginnerTestProgress();

    function startTimer(){
      timer = setInterval(function(){
        timeLeft--;
        var el = overlay.querySelector('#quizTimer');
        if(el) el.textContent = formatTestTime(timeLeft);
        if(timeLeft <= 60){
          var tw = overlay.querySelector('.quiz-timer');
          if(tw) tw.classList.add('warning');
        }
        if(timeLeft <= 0){
          clearInterval(timer);
          finishTest();
        }
      }, 1000);
    }

    function formatTestTime(s){
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function renderQuestion(){
      if(quizFinished) return;
      var q = questions[currentQ];
      var progressPct = ((currentQ + 1) / questions.length) * 100;

      var html = '<div class="lesson-player quiz-player">';
      html += '<div class="lesson-player-header quiz-header">';
      html += '<button class="lesson-close-btn" id="quizClose" type="button" aria-label="Close">';
      html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      html += '</button>';
      html += '<div class="lesson-header-info">';
      html += '<div class="lesson-header-title"><span class="lesson-tier-badge" style="background:#d4a85320;color:#d4a853">Beginner ' + test.label + '</span></div>';
      html += '<div class="lesson-header-step">Question ' + (currentQ + 1) + ' of ' + questions.length + '</div>';
      html += '</div>';
      html += '<div class="quiz-timer' + (timeLeft <= 60 ? ' warning' : '') + '"><span class="quiz-timer-icon">\u23F1</span><span id="quizTimer">' + formatTestTime(timeLeft) + '</span></div>';
      html += '<div class="lesson-progress-bar"><div class="lesson-progress-fill" style="width:' + progressPct + '%;background:#d4a853"></div></div>';
      html += '</div>';

      html += '<div class="lesson-player-body">';
      html += '<div class="lesson-scenario">';
      var tBadge = q.type === 'true-false' ? '\u2705 True or False' : q.type === 'multiple-choice' ? '\u2753 Question' : '\uD83D\uDCDD ' + test.label + ' Question';
      html += '<div class="lesson-scenario-badge">' + tBadge + '</div>';
      html += '<h2 class="lesson-section-title">' + esc(q.title) + '</h2>';
      if(q.story) html += '<div class="lesson-scenario-story">' + formatBody(q.story) + '</div>';
      html += '<div class="lesson-scenario-question">' + esc(q.question) + '</div>';
      html += '<div class="lesson-options" id="quizOptions">';
      q.options.forEach(function(opt, oi){
        var isAnswered = answers[currentQ] !== undefined;
        var isSelected = answers[currentQ] === oi;
        var optClass = 'lesson-option';
        if(isAnswered){
          if(opt.correct) optClass += ' correct';
          else if(isSelected) optClass += ' incorrect';
          else optClass += ' dimmed';
        }
        html += '<button class="' + optClass + '" data-oi="' + oi + '" type="button"' + (isAnswered ? ' disabled' : '') + '>';
        html += '<span class="lesson-option-letter">' + String.fromCharCode(65 + oi) + '</span>';
        html += '<span class="lesson-option-text">' + esc(opt.text) + '</span>';
        if(isAnswered && (opt.correct || isSelected)){
          html += '<span class="lesson-option-icon">' + (opt.correct ? '\u2713' : '\u2717') + '</span>';
        }
        html += '</button>';
      });
      html += '</div>';
      if(answers[currentQ] !== undefined){
        var chosen = q.options[answers[currentQ]];
        var fbClass = chosen.correct ? 'correct' : 'incorrect';
        html += '<div class="lesson-feedback ' + fbClass + '">';
        html += '<div class="lesson-feedback-header">' + (chosen.correct ? '\u2705 Correct!' : '\u274C Not quite') + '</div>';
        html += '<div class="lesson-feedback-text">' + esc(chosen.explanation) + '</div>';
        html += '</div>';
      }
      html += '</div></div>';

      html += '<div class="lesson-player-footer">';
      if(currentQ > 0){
        html += '<button class="lesson-btn lesson-btn-back" id="quizBack" type="button">\u2190 Back</button>';
      } else { html += '<div></div>'; }
      var canProceed = answers[currentQ] !== undefined;
      if(currentQ < questions.length - 1){
        html += '<button class="lesson-btn lesson-btn-next' + (!canProceed ? ' disabled' : '') + '" id="quizNext" type="button"' + (!canProceed ? ' disabled' : '') + '>Next \u2192</button>';
      } else {
        html += '<button class="lesson-btn lesson-btn-complete' + (!canProceed ? ' disabled' : '') + '" id="quizFinish" type="button"' + (!canProceed ? ' disabled' : '') + '>Finish Test</button>';
      }
      html += '</div></div>';

      overlay.innerHTML = html;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      overlay.querySelector('#quizClose').addEventListener('click', function(){
        if(confirm('Are you sure you want to leave? Your progress will be lost.')) closeTest();
      });
      var backBtn = overlay.querySelector('#quizBack');
      if(backBtn) backBtn.addEventListener('click', function(){ currentQ--; renderQuestion(); });
      var nextBtn = overlay.querySelector('#quizNext');
      if(nextBtn && canProceed) nextBtn.addEventListener('click', function(){ currentQ++; renderQuestion(); });
      var finishBtn = overlay.querySelector('#quizFinish');
      if(finishBtn && canProceed) finishBtn.addEventListener('click', finishTest);

      if(answers[currentQ] === undefined){
        overlay.querySelectorAll('.lesson-option').forEach(function(btn){
          btn.addEventListener('click', function(){
            answers[currentQ] = parseInt(btn.getAttribute('data-oi'));
            renderQuestion();
          });
        });
      }

      var body = overlay.querySelector('.lesson-player-body');
      if(body) body.scrollTop = 0;
    }

    function finishTest(){
      quizFinished = true;
      if(timer) clearInterval(timer);

      var correct = 0;
      var total = questions.length;
      for(var i = 0; i < total; i++){
        if(answers[i] !== undefined){
          var q = questions[i];
          if(q.options[answers[i]] && q.options[answers[i]].correct) correct++;
        }
      }

      var pct = total > 0 ? correct / total : 0;
      var passed = pct >= BEGINNER_TEST_PASS;
      var bonusXP = passed ? BEGINNER_TEST_XP : 0;

      if(passed){
        testProgress.saveTestResult(testIndex, { passed: true, score: correct, total: total, pct: Math.round(pct * 100), bonusXP: bonusXP, completedAt: Date.now() });
      }

      var timeTaken = timeLimit - timeLeft;
      var resultIcon = passed ? '\uD83C\uDF89' : '\uD83D\uDCDD';
      var resultTitle = passed ? 'Test Passed!' : 'Keep Studying';
      var resultColor = passed ? '#22c55e' : '#f59e0b';

      var html = '<div class="lesson-player quiz-player">';
      html += '<div class="lesson-completion quiz-result">';
      html += '<div class="lesson-completion-burst" style="background:radial-gradient(circle, ' + resultColor + '22 0%, transparent 70%)"></div>';
      html += '<div class="lesson-completion-icon">' + resultIcon + '</div>';
      html += '<h2 class="lesson-completion-title" style="color:' + resultColor + '">' + resultTitle + '</h2>';
      html += '<p class="lesson-completion-subtitle">Beginner ' + test.label + ': ' + test.names.join(' + ') + '</p>';
      html += '<div class="quiz-result-score">';
      html += '<div class="quiz-score-circle" style="--score-pct:' + Math.round(pct * 100) + '%;--score-color:' + resultColor + '">';
      html += '<span class="quiz-score-num">' + Math.round(pct * 100) + '%</span>';
      html += '</div>';
      html += '<div class="quiz-score-detail">' + correct + ' of ' + total + ' correct</div>';
      html += '<div class="quiz-score-time">Time: ' + formatTestTime(timeTaken) + '</div>';
      html += '<div class="quiz-score-threshold">Passing: ' + Math.round(BEGINNER_TEST_PASS * 100) + '%</div>';
      html += '</div>';

      if(passed){
        html += '<div class="lesson-completion-stats">';
        html += '<div class="lesson-stat"><div class="lesson-stat-value">+' + bonusXP + '</div><div class="lesson-stat-label">Bonus XP</div></div>';
        html += '<div class="lesson-stat"><div class="lesson-stat-value">\u2705</div><div class="lesson-stat-label">' + test.label + ' Passed</div></div>';
        html += '</div>';
      } else {
        html += '<div class="quiz-retry-msg">Review the lessons and try again. You need ' + Math.round(BEGINNER_TEST_PASS * 100) + '% to pass.</div>';
      }

      html += '<button class="lesson-btn lesson-btn-complete" id="quizDone" type="button">' + (passed ? 'Continue' : 'Back to Lessons') + '</button>';
      html += '</div></div>';

      overlay.innerHTML = html;
      overlay.querySelector('#quizDone').addEventListener('click', function(){
        closeTest();
        if(typeof window.refreshEducation === 'function') window.refreshEducation();
      });
    }

    function closeTest(){
      if(timer) clearInterval(timer);
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(function(){ overlay.remove(); }, 300);
      if(typeof window.refreshEducation === 'function') window.refreshEducation();
    }

    startTimer();
    renderQuestion();
  }

  function getBeginnerTestXP(){
    var qp = getQuizProgress();
    var total = 0;
    for(var i = 0; i < 4; i++){
      var k = 'beginner_test_' + i;
      if(qp[k] && qp[k].passed && qp[k].bonusXP) total += qp[k].bonusXP;
    }
    return total;
  }

  var prevGetTotalXP = getTotalXP;
  getTotalXP = function(){
    return prevGetTotalXP() + getBeginnerTestXP();
  };

  window.openLesson = openLesson;
  window.getLessonStatus = getLessonStatus;
  window.getTotalXP = getTotalXP;
  window.getCompletedCount = getCompletedCount;
  window.getCompletedCountForTier = getCompletedCountForTier;
  window.getStreak = getStreak;
  window.resolveStatuses = resolveStatuses;
  window.getActiveTier = getActiveTier;
  window.setActiveTier = setActiveTier;
  window.getAllLessons = getAllLessons;
  window.openTierQuiz = openTierQuiz;
  window.isTierComplete = isTierComplete;
  window.isTierQuizPassed = isTierQuizPassed;
  window.generateCertificate = generateCertificate;
  window.openBeginnerTest = openBeginnerTest;
  window.BEGINNER_TESTS = BEGINNER_TESTS;
  window.areTestLessonsComplete = areTestLessonsComplete;
  window.getBeginnerTestProgress = getBeginnerTestProgress;
})();
