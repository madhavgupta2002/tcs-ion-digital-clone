import type { ExamConfig } from '../types';

declare global {
  interface Window {
    /** Host pages can inject the exam config directly before the app boots. */
    EXAM_CONFIG?: ExamConfig;
  }
}

export function validateConfig(raw: unknown): ExamConfig {
  const c = raw as ExamConfig;
  const errors: string[] = [];
  if (!c || typeof c !== 'object') throw new Error('Config must be a JSON object');
  if (!c.id) errors.push('id is required');
  if (!c.title) errors.push('title is required');
  if (!c.candidate?.name) errors.push('candidate.name is required');
  if (!c.timing || !['sectional', 'global'].includes(c.timing.mode)) errors.push('timing.mode must be "sectional" or "global"');
  if (c.timing?.mode === 'global' && !(c.timing.totalDurationSec! > 0)) errors.push('timing.totalDurationSec is required for global mode');
  if (!Array.isArray(c.sections) || c.sections.length === 0) errors.push('sections must be a non-empty array');
  c.sections?.forEach((s, si) => {
    const where = `sections[${si}] (${s.id ?? '?'})`;
    if (!s.id || !s.name) errors.push(`${where}: id and name are required`);
    if (c.timing?.mode === 'sectional' && !(s.durationSec! > 0)) errors.push(`${where}: durationSec is required for sectional mode`);
    if (!Array.isArray(s.questions) || s.questions.length === 0) errors.push(`${where}: questions must be non-empty`);
    s.questions?.forEach((q, qi) => {
      const qw = `${where}.questions[${qi}] (${q.id ?? '?'})`;
      if (!q.id) errors.push(`${qw}: id is required`);
      if (!['MCQ', 'MSQ', 'TITA'].includes(q.type)) errors.push(`${qw}: type must be MCQ, MSQ or TITA`);
      if (q.type !== 'TITA' && !(q.options && q.options.length > 1)) errors.push(`${qw}: options required for ${q.type}`);
      if (q.passageId && !s.passages?.some((p) => p.id === q.passageId)) errors.push(`${qw}: passage "${q.passageId}" not found`);
    });
  });
  if (errors.length) throw new Error('Invalid exam config:\n• ' + errors.join('\n• '));
  return c;
}

/**
 * Resolution order:
 *  1. window.EXAM_CONFIG (injected by a host page)
 *  2. ?config=<url> query parameter
 *  3. ?exam=<file> → /exams/<file>
 *  4. null → caller shows the exam picker
 */
export async function loadConfigFromEnvironment(): Promise<ExamConfig | null> {
  if (window.EXAM_CONFIG) return validateConfig(window.EXAM_CONFIG);
  const params = new URLSearchParams(location.search);
  const url = params.get('config') ?? (params.get('exam') ? `${import.meta.env.BASE_URL}exams/${params.get('exam')}` : null);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load exam config from ${url} (${res.status})`);
  return validateConfig(await res.json());
}
