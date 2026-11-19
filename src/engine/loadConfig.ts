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
      if (!['MCQ', 'MSQ', 'TITA', 'WRITTEN'].includes(q.type)) errors.push(`${qw}: unsupported question type`);
      if (['MCQ', 'MSQ'].includes(q.type) && !(q.options && q.options.length > 1)) errors.push(`${qw}: options required for ${q.type}`);
      if (q.type === 'WRITTEN' && q.answer != null) errors.push(`${qw}: written answers must be self reviewed`);
      if (q.msqPartialMarks != null && (
        q.type !== 'MSQ' || !Array.isArray(q.answer) || !q.answer.length
        || !Array.isArray(q.msqPartialMarks) || q.msqPartialMarks.length !== q.answer.length + 1
        || q.msqPartialMarks[0] !== 0
        || q.msqPartialMarks.some((mark, index, marks) => !Number.isFinite(mark) || mark < 0
          || mark > (q.marks ?? s.marks ?? c.defaults?.marks ?? 3)
          || (index > 0 && mark < marks[index - 1]))
        || q.msqPartialMarks[q.answer.length] !== (q.marks ?? s.marks ?? c.defaults?.marks ?? 3)
      )) errors.push(`${qw}: invalid multiple-select partial marks`);
      if (q.passageId && !s.passages?.some((p) => p.id === q.passageId)) errors.push(`${qw}: passage "${q.passageId}" not found`);
      if (q.acceptedAnswers != null && (
        !Array.isArray(q.acceptedAnswers) || q.type === 'MSQ' || q.answer == null
        || q.acceptedAnswers.some((answer) => q.type === 'MCQ'
          ? !q.options?.some((option) => option.id === String(answer))
          : !/^-?\d+(\.\d+)?$/.test(String(answer)))
      )) errors.push(`${qw}: invalid alternative answer keys`);
      if (q.answerRanges != null && (
        q.type !== 'TITA' || !Array.isArray(q.answerRanges) || q.answerRanges.length < 2
        || q.answerRanges.some((range) => !Array.isArray(range) || range.length !== 2
          || !range.every((value) => typeof value === 'number' && Number.isFinite(value))
          || range[0] > range[1])
        || q.answer == null || !Number.isFinite(Number(q.answer))
        || !q.answerRanges.some(([low, high]) => Number(q.answer) >= low && Number(q.answer) <= high)
        || q.answerRange != null || q.acceptedAnswers != null || q.tolerance != null
      )) errors.push(`${qw}: invalid alternative numerical ranges`);
      if (q.answerRange != null && (
        q.type !== 'TITA' || !Array.isArray(q.answerRange) || q.answerRange.length !== 2
        || !q.answerRange.every((value) => typeof value === 'number' && Number.isFinite(value))
        || q.answerRange[0] > q.answerRange[1] || q.answer == null
        || !Number.isFinite(Number(q.answer))
        || Number(q.answer) < q.answerRange[0] || Number(q.answer) > q.answerRange[1]
        || q.acceptedAnswers != null || q.tolerance != null
      )) errors.push(`${qw}: invalid numerical answer range`);
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
