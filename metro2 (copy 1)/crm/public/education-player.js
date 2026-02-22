(function(){
  'use strict';

  var EDU_STORAGE_KEY = 'edu_progress';
  var XP_PER_LESSON = 100;

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

  function getTotalXP(){
    var p = getProgress();
    var all = getAllLessons();
    var xp = 0;
    for(var key in p){
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
    for(var key in p){ if(p[key] && p[key].completed) count++; }
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
      var raw = localStorage.getItem('edu_streak');
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
    try { localStorage.setItem('edu_streak', JSON.stringify(streak)); } catch {}
    return streak;
  }

  function esc(s){
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
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
    try { return localStorage.getItem('edu_active_tier') || 'beginner'; } catch { return 'beginner'; }
  }

  function setActiveTier(tier){
    try { localStorage.setItem('edu_active_tier', tier); } catch {}
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
      } else if(section.type === 'scenario'){
        html += '<div class="lesson-scenario">';
        html += '<div class="lesson-scenario-badge">📋 Scenario</div>';
        html += '<h2 class="lesson-section-title">' + esc(section.title) + '</h2>';
        html += '<div class="lesson-scenario-story">' + formatBody(section.story) + '</div>';
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

      if(section.type === 'scenario' && answered[currentStep] === undefined){
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
})();
