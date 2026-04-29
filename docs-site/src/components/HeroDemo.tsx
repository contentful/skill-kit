import { useState, useEffect, useRef, useCallback } from 'react';
import {
  securityAudit,
  type TerminalFrame,
  type SurveyPicker,
  type SurveyReview,
  type AnswersSummary,
  type SubagentRunning,
  type SubagentDone,
  type PlanCard,
  type ActionRunning,
  type ActionDone,
  type SummaryLine,
} from '../data/storyboard';

const storyboard = securityAudit;
const SCENES = storyboard.scenes;
const RESTART_DELAY = 2000;

// Flatten scenes→frames into linear index
const allFrames: { sceneIdx: number; stepName: string; content: TerminalFrame; duration: number }[] = [];
for (let s = 0; s < SCENES.length; s++) {
  for (const frame of SCENES[s].frames) {
    allFrames.push({ sceneIdx: s, stepName: SCENES[s].stepName, content: frame.content, duration: frame.duration });
  }
}

// --- Colors ---

const c = {
  codeBg: '#1e293b', codeBorder: '#334155', codeText: '#e2e8f0',
  termBg: '#0e0e0e', termBorder: '#1e1e1e', termText: '#d4d4d4',
  green: '#4ade80', blue: '#60a5fa', purple: '#c084fc', amber: '#fbbf24',
  dim: '#525252', muted: '#737373', white: '#e5e5e5', accent: '#0f9199',
  kw: '#c792ea', str: '#c3e88d', fn: '#82aaff', id: '#89ddff', brace: '#7c8ba0',
};

// ═══════════════════════════════════════════════════════
// CODE PANEL (unchanged logic)
// ═══════════════════════════════════════════════════════

type Token = { text: string; color?: string };
const KEYWORDS = new Set(['export', 'default', 'const']);
const FN_NAMES = new Set(['skill', 'step', 'survey', 'subagent', 'plan', 'checklist', 'build', 'act']);
const PROPS = new Set(['name', 'entry', 'prompt', 'next', 'question', 'options', 'steps', 'create', 'action', 'run']);
const IDS = new Set(['terminal', 'saveReport', 'sections']);

function tokenizeLine(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === ' ' || raw[i] === '\t') {
      let j = i; while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t')) j++;
      tokens.push({ text: raw.slice(i, j) }); i = j;
    } else if (raw[i] === "'") {
      let j = i + 1; while (j < raw.length && raw[j] !== "'") j++; j++;
      tokens.push({ text: raw.slice(i, j), color: c.str }); i = j;
    } else if (raw.slice(i, i + 3) === '...') {
      tokens.push({ text: '...', color: c.id }); i += 3;
    } else if ('{}[]()'.includes(raw[i])) {
      tokens.push({ text: raw[i], color: c.brace }); i++;
    } else if (',:'.includes(raw[i])) {
      tokens.push({ text: raw[i], color: c.brace }); i++;
    } else if (raw[i] === '.') {
      tokens.push({ text: '.', color: c.brace }); i++;
    } else if (/[a-zA-Z_$]/.test(raw[i])) {
      let j = i; while (j < raw.length && /[a-zA-Z0-9_$]/.test(raw[j])) j++;
      const word = raw.slice(i, j);
      const rest = raw.slice(j).match(/^(\s*)(.)/);
      const nextChar = rest ? rest[2] : '';
      let color: string | undefined;
      if (KEYWORDS.has(word)) color = c.kw;
      else if (FN_NAMES.has(word) && (nextChar === '(' || nextChar === '.')) color = c.fn;
      else if (PROPS.has(word) && nextChar === ':') color = c.codeText;
      else if (IDS.has(word)) color = c.id;
      tokens.push({ text: word, color }); i = j;
    } else {
      tokens.push({ text: raw[i] }); i++;
    }
  }
  return tokens;
}

const codeTokens = storyboard.code.split('\n').map(tokenizeLine);

function buildStepRanges(code: string): Map<number, string> {
  const lines = code.split('\n');
  const map = new Map<number, string>();
  let currentStep: string | null = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/\.step\('([^']+)'/);
    if (m) { currentStep = m[1]; depth = 0; }
    if (currentStep !== null) {
      map.set(i, currentStep);
      for (const ch of line) { if (ch === '{' || ch === '(') depth++; if (ch === '}' || ch === ')') depth--; }
      if (depth <= 0) currentStep = null;
    }
  }
  return map;
}
const stepRanges = buildStepRanges(storyboard.code);

function CodePanel({ activeStep }: { activeStep: string | null }) {
  return (
    <div style={{
      background: c.codeBg, border: `1px solid ${c.codeBorder}`, borderRadius: 10,
      overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, lineHeight: 1.65,
    }}>
      <div style={{
        padding: '8px 16px', borderBottom: `1px solid ${c.codeBorder}`,
        background: 'rgba(0,0,0,0.2)', color: '#64748b', fontSize: 12,
      }}>
        security-audit.ts
      </div>
      <div style={{ padding: '14px 0', overflowX: 'auto' }}>
        {codeTokens.map((tokens, i) => {
          const step = stepRanges.get(i);
          const isActive = step !== undefined && step === activeStep;
          return (
            <div key={i} style={{
              padding: '0 16px', minHeight: 21, whiteSpace: 'pre',
              borderLeft: isActive ? `3px solid ${c.accent}` : '3px solid transparent',
              background: isActive ? 'rgba(15,145,153,0.08)' : 'transparent',
              transition: 'background 400ms ease, border-color 400ms ease',
            }}>
              {tokens.length === 0 ? ' ' : tokens.map((t, j) =>
                t.color ? <span key={j} style={{ color: t.color }}>{t.text}</span> : <span key={j}>{t.text}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TERMINAL: Summary line renderers (condensed past)
// ═══════════════════════════════════════════════════════

function SummaryAgent({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <span style={{ color: c.green, fontSize: 9 }}>●</span>
      <span style={{ color: c.termText }}>{text}</span>
    </div>
  );
}

function SummaryAnswers({ answers }: { answers: { question: string; answer: string }[] }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ color: c.green, fontSize: 9 }}>●</span>
        <span style={{ color: c.white, fontWeight: 600 }}>User answered questions:</span>
      </div>
      {answers.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, paddingLeft: 20, alignItems: 'baseline' }}>
          <span style={{ color: c.dim, width: 12, flexShrink: 0 }}>{i === 0 ? '└' : ' '}</span>
          <span style={{ color: c.dim }}>·</span>
          <span style={{ color: c.muted }}>{a.question}</span>
          <span style={{ color: c.dim }}>→</span>
          <span style={{ color: c.blue, fontWeight: 500 }}>{a.answer}</span>
        </div>
      ))}
    </div>
  );
}

function SummarySubagent({ label, name, stats }: { label: string; name: string; stats: string }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: c.blue, fontSize: 9 }}>●</span>
        <span style={{ color: c.blue, fontWeight: 700 }}>{label}</span>
        <span style={{ color: c.termText }}>({name})</span>
      </div>
      <div style={{ paddingLeft: 20, display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ color: c.dim }}>└</span>
        <span style={{ color: c.dim }}>Done ({stats})</span>
      </div>
    </div>
  );
}

function SummaryMeta({ text }: { text: string }) {
  return <div style={{ paddingLeft: 20, color: c.dim, fontSize: 12 }}>{text}</div>;
}

function RenderSummaryLine({ line }: { line: SummaryLine }) {
  switch (line.type) {
    case 'agent': return <SummaryAgent text={line.text} />;
    case 'answers': return <SummaryAnswers answers={line.answers} />;
    case 'subagent': return <SummarySubagent label={line.label} name={line.name} stats={line.stats} />;
    case 'meta': return <SummaryMeta text={line.text} />;
  }
}

// ═══════════════════════════════════════════════════════
// TERMINAL: Rich frame renderers (active step)
// ═══════════════════════════════════════════════════════

function TabBar({ tabs }: { tabs: SurveyPicker['tabs'] }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <span style={{ color: c.dim }}>←</span>
      {tabs.map((t, i) => (
        <span key={i} style={{
          padding: '2px 8px', borderRadius: 3, fontSize: 12, fontWeight: 500,
          background: t.active ? 'rgba(96,165,250,0.15)' : 'transparent',
          color: t.active ? c.blue : t.done ? c.muted : c.dim,
          border: t.active ? '1px solid rgba(96,165,250,0.3)' : '1px solid transparent',
        }}>
          {t.done ? '✓ ' : '☐ '}{t.label}
        </span>
      ))}
      <span style={{ color: c.dim }}>→</span>
    </div>
  );
}

function FrameSurveyPicker({ data }: { data: SurveyPicker }) {
  return (
    <div>
      <TabBar tabs={data.tabs} />
      <div style={{ color: c.white, fontWeight: 600, marginBottom: 10 }}>{data.question}</div>
      {data.options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0', color: opt.selected ? c.termText : c.dim }}>
          <span style={{ color: c.green, fontWeight: 700, width: 14, flexShrink: 0 }}>{opt.selected ? '›' : ' '}</span>
          <span style={{ width: 18, flexShrink: 0 }}>{i + 1}.</span>
          <div>
            <div style={{ fontWeight: opt.selected ? 600 : 400, color: opt.selected ? '#fff' : 'inherit' }}>{opt.label}</div>
            {opt.description && <div style={{ fontSize: 12, color: c.dim }}>{opt.description}</div>}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 10, fontSize: 12, color: c.dim }}>{data.footer}</div>
    </div>
  );
}

function FrameSurveyReview({ data }: { data: SurveyReview }) {
  return (
    <div>
      <TabBar tabs={data.tabs} />
      <div style={{ color: c.white, fontWeight: 600, marginBottom: 8 }}>Review your answers</div>
      {data.answers.map((a, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <span style={{ color: c.green, fontSize: 9 }}>●</span>
            <span style={{ color: c.muted }}>{a.question}</span>
          </div>
          <div style={{ paddingLeft: 18, color: c.blue, fontWeight: 500 }}>→ {a.answer}</div>
        </div>
      ))}
      <div style={{ marginTop: 10, color: c.muted, marginBottom: 6 }}>Ready to submit your answers?</div>
      {data.confirmOptions.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, padding: '1px 0', color: opt.selected ? c.termText : c.dim }}>
          <span style={{ color: c.green, fontWeight: 700, width: 14, flexShrink: 0 }}>{opt.selected ? '›' : ' '}</span>
          <span style={{ width: 18, flexShrink: 0 }}>{i + 1}.</span>
          <span style={{ fontWeight: opt.selected ? 600 : 400, color: opt.selected ? '#fff' : 'inherit' }}>{opt.label}</span>
        </div>
      ))}
    </div>
  );
}

function FrameAnswersSummary({ data }: { data: AnswersSummary }) {
  return <SummaryAnswers answers={data.answers} />;
}

function FrameSubagentRunning({ data }: { data: SubagentRunning }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ color: c.green, fontSize: 9 }}>●</span>
        <span style={{ color: c.termText }}>{data.agentMessage}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: c.blue, fontSize: 9 }}>●</span>
        <span style={{ color: c.blue, fontWeight: 700 }}>{data.label}</span>
        <span style={{ color: c.termText }}>({data.name})</span>
      </div>
      <div style={{ paddingLeft: 20, display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ color: c.dim }}>└</span>
        <span style={{ color: c.amber }}>Running…</span>
      </div>
      <div style={{ paddingLeft: 26, marginTop: 2, fontSize: 12, color: c.dim }}>{data.elapsed}</div>
    </div>
  );
}

function FrameSubagentDone({ data }: { data: SubagentDone }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ color: c.green, fontSize: 9 }}>●</span>
        <span style={{ color: c.termText }}>{data.agentMessage}</span>
      </div>
      <SummarySubagent label={data.label} name={data.name} stats={data.stats} />
    </div>
  );
}

function FramePlan({ data }: { data: PlanCard }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ color: c.green, fontSize: 9 }}>●</span>
        <span style={{ color: c.termText }}>Here's the proposed audit structure.</span>
      </div>
      <div style={{ border: '1px solid #262626', borderRadius: 8, overflow: 'hidden', marginLeft: 8 }}>
        <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid #262626' }}>
          <span style={{ color: c.purple, fontWeight: 700, fontSize: 13 }}>{data.title}</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          {data.steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', flexWrap: 'wrap' }}>
              <span style={{ color: c.dim, width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ color: c.white, fontWeight: 600 }}>{s.heading}</span>
              <span style={{ color: c.muted }}>— {s.detail}</span>
            </div>
          ))}
          <div style={{ height: 1, background: '#262626', margin: '10px 0' }} />
          <div style={{ color: c.muted, marginBottom: 6 }}>{data.approval.question}</div>
          {data.approval.options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, padding: '1px 0', color: opt.selected ? c.termText : c.dim }}>
              <span style={{ color: c.green, fontWeight: 700, width: 12, flexShrink: 0 }}>{opt.selected ? '›' : ' '}</span>
              <span style={{ width: 16, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontWeight: opt.selected ? 600 : 400, color: opt.selected ? '#fff' : 'inherit' }}>{opt.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameActionRunning({ data }: { data: ActionRunning }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ color: c.green, fontSize: 9 }}>●</span>
        <span style={{ color: c.termText }}>{data.agentMessage}</span>
      </div>
      <div style={{ paddingLeft: 20, display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: c.amber }}>⟳</span>
        <span style={{ color: c.amber }}>Running action</span>
        <span style={{ color: c.dim }}>{data.actionLabel}</span>
      </div>
    </div>
  );
}

function FrameActionDone({ data }: { data: ActionDone }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ color: c.green, fontSize: 9 }}>●</span>
        <span style={{ color: c.green }}>{data.agentMessage}</span>
      </div>
      <div style={{ paddingLeft: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ color: c.green }}>✓</span>
          <span style={{ color: c.dim }}>{data.actionLabel}</span>
        </div>
        <div style={{ paddingLeft: 20, color: c.muted, fontSize: 12 }}>{data.result}</div>
      </div>
    </div>
  );
}

function RenderFrame({ frame }: { frame: TerminalFrame }) {
  switch (frame.type) {
    case 'survey-picker': return <FrameSurveyPicker data={frame.data} />;
    case 'survey-review': return <FrameSurveyReview data={frame.data} />;
    case 'answers-summary': return <FrameAnswersSummary data={frame.data} />;
    case 'subagent-running': return <FrameSubagentRunning data={frame.data} />;
    case 'subagent-done': return <FrameSubagentDone data={frame.data} />;
    case 'plan': return <FramePlan data={frame.data} />;
    case 'action-running': return <FrameActionRunning data={frame.data} />;
    case 'action-done': return <FrameActionDone data={frame.data} />;
  }
}

// ═══════════════════════════════════════════════════════
// TERMINAL PANEL: scrolling log with condensed past
// ═══════════════════════════════════════════════════════

function TerminalPanel({ frameIndex, activeSceneIdx }: { frameIndex: number; activeSceneIdx: number }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on any change
  useEffect(() => {
    const el = bodyRef.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  }, [frameIndex]);

  const currentFrame = allFrames[frameIndex];

  return (
    <div style={{
      background: c.termBg, border: `1px solid ${c.termBorder}`, borderRadius: 10,
      overflow: 'hidden', fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 13, lineHeight: 1.55, color: c.termText,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Command header */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${c.termBorder}` }}>
        <span style={{ color: c.dim, marginRight: 8 }}>▸</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{storyboard.command}</span>
      </div>

      {/* Scrolling log body */}
      <div ref={bodyRef} style={{
        flex: 1, padding: '12px 20px', overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>
        {/* Past scenes: render summaries */}
        {SCENES.slice(0, activeSceneIdx).map((scene, sIdx) => (
          <div key={`s-${sIdx}`} style={{ marginBottom: 10 }}>
            {scene.summary.map((line, lIdx) => (
              <div key={lIdx} style={{ marginBottom: 3 }}>
                <RenderSummaryLine line={line} />
              </div>
            ))}
          </div>
        ))}

        {/* Current scene: rich frame */}
        {currentFrame && (
          <div key={`active-${frameIndex}`} style={{
            animation: 'fadeSlideIn 350ms ease both',
          }}>
            <RenderFrame frame={currentFrame.content} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// STEP DOTS (clickable)
// ═══════════════════════════════════════════════════════

function StepDots({ activeScene, onClickScene }: { activeScene: number; onClickScene: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', padding: '12px 0' }}>
      {SCENES.map((scene, i) => (
        <button key={i} onClick={() => onClickScene(i)} title={scene.stepName} style={{
          width: i === activeScene ? 20 : 8, height: 8, borderRadius: 4,
          background: i === activeScene ? c.accent : i < activeScene ? c.muted : '#ccc',
          border: 'none', padding: 0, cursor: 'pointer',
          transition: 'width 300ms ease, background 300ms ease',
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ORCHESTRATOR
// ═══════════════════════════════════════════════════════

export default function HeroDemo() {
  const [frameIndex, setFrameIndex] = useState(-1);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const advance = useCallback(() => {
    setFrameIndex((prev) => {
      const next = prev + 1;
      if (next >= allFrames.length) return -1;
      return next;
    });
  }, []);

  const firstFrameOfScene = useCallback((sceneIdx: number): number => {
    let idx = 0;
    for (let s = 0; s < sceneIdx; s++) idx += SCENES[s].frames.length;
    return idx;
  }, []);

  const jumpToScene = useCallback((sceneIdx: number) => {
    setFrameIndex(firstFrameOfScene(sceneIdx));
  }, [firstFrameOfScene]);

  useEffect(() => {
    if (!startedRef.current || paused) return;
    if (frameIndex === -1) {
      timerRef.current = setTimeout(() => setFrameIndex(0), RESTART_DELAY);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    if (frameIndex >= 0 && frameIndex < allFrames.length) {
      timerRef.current = setTimeout(advance, allFrames[frameIndex].duration);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
  }, [frameIndex, paused, advance]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || startedRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFrameIndex(allFrames.length - 1);
      startedRef.current = true;
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          setFrameIndex(0);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const safeFrameIndex = Math.max(0, frameIndex);
  const currentFrame = allFrames[safeFrameIndex];
  const activeStep = currentFrame ? currentFrame.stepName : null;
  const activeScene = currentFrame ? currentFrame.sceneIdx : 0;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="hero-demo"
    >
      <div className="hero-demo-code">
        <CodePanel activeStep={activeStep} />
      </div>
      <div className="hero-demo-terminal">
        <TerminalPanel frameIndex={safeFrameIndex} activeSceneIdx={activeScene} />
        <StepDots activeScene={activeScene} onClickScene={jumpToScene} />
      </div>
    </div>
  );
}
