import React, { useState } from 'react';
import { useSubmitQuiz } from './hooks.ts';

const QUESTIONS = [
  {
    id: 'q1',
    question: 'What does FCRA stand for?',
    options: ['Fair Credit Reporting Act', 'Federal Credit Review Agency', 'Financial Consumer Rights Act', 'Fair Collections Reporting Act'],
    answer: 'Fair Credit Reporting Act',
  },
  {
    id: 'q2',
    question: 'Under Metro 2 format, what field indicates an account\'s payment history?',
    options: ['Account Status', 'Payment Rating', 'Compliance Condition Code', 'ECOA Code'],
    answer: 'Payment Rating',
  },
  {
    id: 'q3',
    question: 'How many days does a bureau have to investigate a dispute under FCRA Section 611?',
    options: ['15 days', '30 days', '45 days', '60 days'],
    answer: '30 days',
  },
  {
    id: 'q4',
    question: 'What is the maximum time a negative item can stay on a credit report?',
    options: ['5 years', '7 years', '10 years', 'Indefinitely'],
    answer: '7 years',
  },
  {
    id: 'q5',
    question: 'Which bureau format does Metro 2 apply to?',
    options: ['Equifax only', 'Experian only', 'All three major bureaus', 'TransUnion only'],
    answer: 'All three major bureaus',
  },
];

export function QuizPage() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const submitM = useSubmitQuiz();

  const handleSubmit = () => {
    const correct = QUESTIONS.filter(q => answers[q.id] === q.answer).length;
    setScore(correct);
    setSubmitted(true);
    submitM.mutate(answers);
  };

  const pct = Math.round((score / QUESTIONS.length) * 100);

  return (
    <div className="workspace px-4 pb-12">
      <div className="workspace-inner max-w-2xl mx-auto space-y-6">
        <section className="workspace-hero glass card">
          <div className="hero-top">
            <div>
              <h1 className="hero-title">Credit Repair Quiz</h1>
              <p className="hero-subtitle">Test your knowledge of FCRA, Metro 2, and credit reporting fundamentals.</p>
            </div>
          </div>
        </section>

        {submitted ? (
          <div className="glass card p-8 text-center">
            <div style={{ fontSize: 64, marginBottom: 16 }}>
              {pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '📚'}
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: '#d4a853', marginBottom: 8 }}>
              {score} / {QUESTIONS.length} Correct
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
              {pct >= 80 ? 'Excellent! You know your credit law.' : pct >= 60 ? 'Good job! Keep studying to sharpen your edge.' : 'Keep learning — revisit the Credit Academy modules.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn" onClick={() => { setSubmitted(false); setAnswers({}); setScore(0); }}>
                Retake Quiz
              </button>
              <a href="/education" className="btn btn-outline">Go to Academy</a>
            </div>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
            <div className="space-y-4">
              {QUESTIONS.map((q, i) => (
                <div key={q.id} className="glass card p-5">
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', marginBottom: 16 }}>
                    <span style={{ color: '#d4a853', marginRight: 8 }}>{i + 1}.</span>{q.question}
                  </p>
                  <div className="space-y-2">
                    {q.options.map(opt => (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg transition-all" style={{
                        background: answers[q.id] === opt ? 'rgba(212,168,83,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${answers[q.id] === opt ? 'rgba(212,168,83,0.4)' : 'rgba(255,255,255,0.07)'}`,
                      }}>
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                          style={{ accentColor: '#d4a853' }}
                        />
                        <span style={{ fontSize: 14, color: '#e5e7eb' }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button
                type="submit"
                className="btn"
                disabled={Object.keys(answers).length < QUESTIONS.length}
                style={{ padding: '12px 32px', fontSize: 15 }}
              >
                Submit Quiz
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
