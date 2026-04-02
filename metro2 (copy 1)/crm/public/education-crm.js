(function(){
  'use strict';

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var COACH_INTROS = {
    beginner:     "Let's build your foundation. Understanding your credit score is the first step to transforming it.",
    intermediate: "You're ready for the real law. FCRA and FDCPA are your sharpest weapons — let's use them.",
    expert:       "This is where most people stop. Master the legal strategies that separate pros from the rest."
  };

  function renderEducation(){
    var container = document.getElementById('education');
    if(!container) return;
    var activeTier = typeof window.getActiveTier === 'function' ? window.getActiveTier() : 'beginner';

    var tiers = {
      beginner:     { data: window.EDUCATION_LESSONS     || [], label: 'Beginner',     icon: '📗', xpEach: 100, desc: 'Credit fundamentals',  color: '#22c55e', iconBg: 'linear-gradient(135deg,#22c55e,#16a34a)' },
      intermediate: { data: window.EDUCATION_INTERMEDIATE || [], label: 'Intermediate', icon: '📙', xpEach: 150, desc: 'FCRA, FDCPA, CFPB',   color: '#f59e0b', iconBg: 'linear-gradient(135deg,#f59e0b,#d97706)' },
      expert:       { data: window.EDUCATION_EXPERT       || [], label: 'Expert',       icon: '📕', xpEach: 200, desc: 'Legal & regulatory',   color: '#ef4444', iconBg: 'linear-gradient(135deg,#ef4444,#dc2626)' }
    };

    var currentTier   = tiers[activeTier] || tiers.beginner;
    var lessonData    = currentTier.data;
    var statuses      = typeof window.resolveStatuses          === 'function' ? window.resolveStatuses(lessonData)        : lessonData.map(function(_,i){ return i === 0 ? 'current' : 'locked'; });
    var allLessons    = typeof window.getAllLessons             === 'function' ? window.getAllLessons()                    : lessonData;
    var completedCount= typeof window.getCompletedCount        === 'function' ? window.getCompletedCount()                : 0;
    var totalXP       = typeof window.getTotalXP               === 'function' ? window.getTotalXP()                      : 0;
    var streak        = typeof window.getStreak                === 'function' ? window.getStreak()                       : { days: 0 };
    var tierCompleted = typeof window.getCompletedCountForTier === 'function' ? window.getCompletedCountForTier(lessonData): 0;

    var level    = Math.floor(totalXP / 800) + 1;
    var xpInLevel= totalXP % 800;
    var xpPct    = Math.min((xpInLevel / 800) * 100, 100);

    var header = document.querySelector('.edu-header');
    if(header){
      var levelBadge = header.querySelector('.edu-level-badge');
      if(levelBadge) levelBadge.textContent = 'Level ' + level;
      var xpLabel = header.querySelector('.edu-xp-label .text-xs');
      if(xpLabel) xpLabel.textContent = totalXP + ' / ' + (level * 800) + ' XP';
      var xpFill = header.querySelector('.edu-xp-fill');
      if(xpFill) xpFill.style.width = xpPct + '%';
      var statsLine = header.querySelector('.edu-xp-bar .flex');
      if(statsLine) statsLine.innerHTML = '<span>\uD83D\uDD25 ' + (streak.days || 0) + ' day streak</span><span>\u2705 ' + completedCount + ' of ' + allLessons.length + ' complete</span>';
    }

    var tabsHtml = '<div class="edu-tier-tabs">';
    ['beginner','intermediate','expert'].forEach(function(key){
      var t  = tiers[key];
      var tc = typeof window.getCompletedCountForTier === 'function' ? window.getCompletedCountForTier(t.data) : 0;
      tabsHtml += '<button class="edu-tier-tab' + (key === activeTier ? ' active' : '') + '" data-tier="' + key + '" type="button" style="--tier-color:' + t.color + '">';
      tabsHtml += '<span class="edu-tier-tab-icon">' + t.icon + '</span>';
      tabsHtml += '<span class="edu-tier-tab-info"><span class="edu-tier-tab-label">' + t.label + '</span><span class="edu-tier-tab-desc">' + t.desc + '</span></span>';
      tabsHtml += '<span class="edu-tier-tab-progress">' + tc + '/' + t.data.length + '</span>';
      tabsHtml += '</button>';
    });
    tabsHtml += '</div>';

    var tierInfoHtml = '<div class="edu-tier-info">';
    tierInfoHtml += '<span class="edu-tier-xp-badge" style="background:' + currentTier.color + '20;color:' + currentTier.color + '">' + currentTier.xpEach + ' XP per lesson</span>';
    tierInfoHtml += '<span class="edu-tier-count">' + tierCompleted + ' of ' + lessonData.length + ' complete</span>';
    tierInfoHtml += '</div>';

    var currentLesson = null;
    statuses.forEach(function(s, i){ if(s === 'current' && !currentLesson) currentLesson = lessonData[i]; });
    var coachMsg = currentLesson
      ? 'Next up: \u201c' + currentLesson.title + '\u201d \u2014 pay attention here.'
      : COACH_INTROS[activeTier];
    var coachHtml = '<div class="edu-coach-bubble" style="border-color:' + currentTier.color + '44;background:' + currentTier.color + '0d">';
    coachHtml += '<div class="edu-coach-avatar">🧑\u200d💼</div>';
    coachHtml += '<div><div class="edu-coach-label" style="color:' + currentTier.color + '">Evolv Guide</div>';
    coachHtml += '<div class="edu-coach-text">' + esc(coachMsg) + '</div></div>';
    coachHtml += '</div>';

    var mapHtml = '<div class="edu-cards-list">';
    lessonData.forEach(function(lesson, i){
      var status   = statuses[i] || 'locked';
      var clickable= status !== 'locked';
      var tag      = clickable ? 'button' : 'div';
      var extra    = clickable ? ' data-lesson-id="' + esc(lesson.id) + '" type="button"' : '';

      var iconContent = status === 'completed' ? '✓'
                      : status === 'current'   ? lesson.icon
                      : '🔒';
      var iconBg = status === 'completed' ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                 : status === 'locked'    ? 'rgba(148,163,184,0.25)'
                 : currentTier.iconBg;
      var borderStyle = status === 'current' ? 'border-color:' + currentTier.color + ';box-shadow:0 0 0 3px ' + currentTier.color + '22' : '';

      var xpText  = status === 'completed' ? '✓ ' + currentTier.xpEach + ' XP' : currentTier.xpEach + ' XP';
      var xpBg    = status === 'completed' ? 'rgba(34,197,94,0.12);color:#22c55e' : currentTier.color + '18;color:' + currentTier.color;
      var statusIcon = status === 'completed' ? '✓' : status === 'current' ? '▶' : '🔒';

      mapHtml += '<' + tag + ' class="edu-card ' + status + '"' + extra + (borderStyle ? ' style="' + borderStyle + '"' : '') + '>';
      mapHtml += '<div class="edu-card-icon" style="background:' + iconBg + '">' + iconContent + '</div>';
      mapHtml += '<div class="edu-card-body">';
      mapHtml += '<div class="edu-card-title">' + esc(lesson.title) + '</div>';
      mapHtml += '<div class="edu-card-subtitle">' + esc(lesson.subtitle) + '</div>';
      mapHtml += '</div>';
      mapHtml += '<div class="edu-card-right">';
      mapHtml += '<span class="edu-card-xp" style="background:' + xpBg + '">' + xpText + '</span>';
      mapHtml += '<span class="edu-card-status">' + statusIcon + '</span>';
      mapHtml += '</div>';
      mapHtml += '</' + tag + '>';
    });
    mapHtml += '</div>';

    var nextBtnHtml = '';
    if(currentLesson){
      nextBtnHtml = '<button class="edu-next-lesson-btn" data-lesson-id="' + esc(currentLesson.id) + '" type="button" style="background:' + currentTier.color + '">';
      nextBtnHtml += '\u25B6\uFE0F  Continue \u2014 ' + esc(currentLesson.title);
      nextBtnHtml += '</button>';
    }

    var tierAllComplete = typeof window.isTierComplete   === 'function' && window.isTierComplete(activeTier);
    var tierQuizPassed  = typeof window.isTierQuizPassed === 'function' && window.isTierQuizPassed(activeTier);
    var remaining = lessonData.length - tierCompleted;

    var quizHtml = '<div class="edu-tier-quiz-section' + (!tierAllComplete ? ' locked' : '') + '">';
    if(tierQuizPassed){
      quizHtml += '<div class="edu-quiz-passed"><span class="edu-quiz-passed-icon">🎓</span><span class="edu-quiz-passed-text">' + currentTier.label + ' Tier Complete — Exam Passed!</span></div>';
      quizHtml += '<button class="edu-cert-btn" data-cert-tier="' + activeTier + '" type="button">Download Certificate 📜</button>';
    } else if(tierAllComplete){
      quizHtml += '<div class="edu-quiz-available"><span class="edu-quiz-icon">📝</span><div class="edu-quiz-info"><div class="edu-quiz-title">' + currentTier.label + ' Final Exam Available!</div><div class="edu-quiz-desc">Pass the timed exam to earn bonus XP and your graduation certificate.</div></div></div>';
      quizHtml += '<button class="edu-quiz-btn" data-quiz-tier="' + activeTier + '" type="button">Take Final Exam</button>';
    } else {
      quizHtml += '<div class="edu-quiz-locked"><span class="edu-quiz-locked-icon">🔒</span><div class="edu-quiz-info"><div class="edu-quiz-title">' + currentTier.label + ' Final Exam</div><div class="edu-quiz-desc">Complete all ' + lessonData.length + ' lessons to unlock. ' + remaining + ' lesson' + (remaining !== 1 ? 's' : '') + ' remaining.</div></div></div>';
      quizHtml += '<button class="edu-quiz-btn disabled" disabled type="button">Take Final Exam</button>';
    }
    quizHtml += '</div>';

    container.innerHTML = tabsHtml + tierInfoHtml + coachHtml + mapHtml + nextBtnHtml + quizHtml;

    container.querySelectorAll('.edu-tier-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        if(typeof window.setActiveTier === 'function') window.setActiveTier(tab.getAttribute('data-tier'));
        renderEducation();
      });
    });
    container.querySelectorAll('[data-lesson-id]').forEach(function(btn){
      btn.addEventListener('click', function(){ if(typeof window.openLesson === 'function') window.openLesson(btn.getAttribute('data-lesson-id')); });
    });
    container.querySelectorAll('[data-quiz-tier]').forEach(function(btn){
      btn.addEventListener('click', function(){ if(typeof window.openTierQuiz === 'function') window.openTierQuiz(btn.getAttribute('data-quiz-tier')); });
    });
    container.querySelectorAll('[data-cert-tier]').forEach(function(btn){
      btn.addEventListener('click', function(){ if(typeof window.generateCertificate === 'function') window.generateCertificate(btn.getAttribute('data-cert-tier')); });
    });
  }

  window.refreshEducation = renderEducation;

  document.addEventListener('DOMContentLoaded', function(){
    var section = document.getElementById('educationSection');
    if(section) section.classList.remove('hidden');
    renderEducation();
  });
})();
