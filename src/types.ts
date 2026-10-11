// ---------------------------------------------------------------------------
// INPUT: exam configuration
// ---------------------------------------------------------------------------

/** MCQ = single correct (radio), MSQ = multiple correct (checkbox), TITA = type-in-the-answer (numeric keypad). */
export type QuestionType = 'MCQ' | 'MSQ' | 'TITA';

export interface Option {
  /** Stable id recorded in the result (e.g. "A"). */
  id: string;
  /** HTML allowed. */
  html: string;
}

export interface Passage {
  id: string;
  /** Bold heading shown above the passage (e.g. "The passage below is accompanied by four questions..."). HTML allowed. */
  directions?: string;
  /** Passage body. HTML allowed. */
  html: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  /** Question stem. HTML allowed. */
  html: string;
  /** Required for MCQ / MSQ. */
  options?: Option[];
  /** When set, the passage is rendered in a left pane next to the question. */
  passageId?: string;
  /** Overrides section / exam defaults. */
  marks?: number;
  negativeMarks?: number;
  /**
   * Optional answer key, used only to compute a score in the result.
   * MCQ: "B"  |  MSQ: ["A","C"]  |  TITA: "42" (or a number)
   */
  answer?: string | number | string[];
  /** TITA numeric tolerance for scoring (absolute). Default 0 (string-equal after trim). */
  tolerance?: number;
  /** MSQ: the candidate cannot tick more than this many options (they must untick one first). */
  maxSelections?: number;
}

export interface Section {
  id: string;
  name: string;
  /** Per-section time limit in seconds (used when timing.mode = "sectional"). */
  durationSec?: number;
  /** Section cannot be submitted before this many seconds have elapsed in it. */
  minTimeSec?: number;
  marks?: number;
  negativeMarks?: number;
  /** Negative marks applied to TITA questions in this section. Default 0. */
  titaNegativeMarks?: number;
  calculator?: boolean;
  /** Which calculator opens in this section. Overrides features.calculatorType. */
  calculatorType?: 'standard' | 'scientific';
  /**
   * MSQ scoring. "exact" (default): full marks only for the exact set. "partial": no wrong option selected
   * gives marks x (correct selected / total correct); any wrong option selected gives 0 (no negative marking).
   */
  msqScoring?: 'exact' | 'partial';
  passages?: Passage[];
  questions: Question[];
}

export interface ExamConfig {
  id: string;
  /** Shown top-left in the yellow title (e.g. "Head Start 2"). */
  title: string;
  candidate: {
    name: string;
    rollNo?: string;
    /** URL / data-URI of the candidate photo. A default avatar is drawn when omitted. */
    photoUrl?: string;
  };
  timing: {
    /**
     * sectional: each section has its own clock, sections are taken in order and locked after submission.
     * global: one clock for the whole exam, candidate may switch between sections freely.
     */
    mode: 'sectional' | 'global';
    /** Required when mode = "global". */
    totalDurationSec?: number;
    /** Warn (red timer) when remaining time drops below this. Default 300s. */
    warnAtSec?: number;
  };
  sections: Section[];
  defaults?: {
    marks?: number;
    negativeMarks?: number;
    titaNegativeMarks?: number;
  };
  features?: {
    calculator?: boolean;
    /** Default calculator for sections that do not set their own. Default "standard". */
    calculatorType?: 'standard' | 'scientific';
    questionPaper?: boolean;
    viewInstructions?: boolean;
    /** Show the "Mark/s | Negative Mark/s" strip above each question. */
    showMarks?: boolean;
    /** Show the confirmation summary table before submitting a section / exam. */
    confirmSubmit?: boolean;
    /** Show the per-section summary + score at the end. */
    showResultSummary?: boolean;
  };
  instructions?: {
    /** Fully replaces the generated page-1 instructions (HTML). */
    generalHtml?: string;
    /** Fully replaces the generated page-2 instructions (HTML). */
    otherHtml?: string;
    /** Extra plain-text notes appended as numbered points to the generated general instructions. */
    notes?: string[];
    /** Declaration shown next to the mandatory checkbox. */
    declaration?: string;
  };
  output?: {
    /** If set, the result JSON is POSTed here on submission. */
    postUrl?: string;
    /** If true (default), the result is posted to the host page that started the exam (popup / iframe embedding). */
    postMessage?: boolean;
    /** Persist the result in localStorage under `tcs-clone-result:<examId>`. Default: true standalone, false when hosted. */
    localStorage?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type QStatus = 'notVisited' | 'notAnswered' | 'answered' | 'marked' | 'answeredMarked';

/** MCQ/MSQ: list of option ids. TITA: typed string. */
export type ResponseValue = string[] | string;

export interface QState {
  status: QStatus;
  /** Committed (saved) response. Only committed responses count. */
  saved: ResponseValue | null;
  timeSpentMs: number;
  visits: number;
  /** Number of times a different response was committed. */
  changes: number;
  firstVisitedAt?: number;
  lastSavedAt?: number;
}

export type SectionStatus = 'locked' | 'active' | 'submitted';

export interface SectionState {
  status: SectionStatus;
  remainingMs: number;
  timeSpentMs: number;
  startedAt?: number;
  submittedAt?: number;
  submitReason?: 'manual' | 'timeout';
  currentQ: number;
}

export type Phase = 'instructions1' | 'instructions2' | 'exam' | 'done';

export interface ExamEvent {
  /** epoch ms */
  t: number;
  type:
    | 'exam_start'
    | 'section_start'
    | 'visit'
    | 'save'
    | 'mark'
    | 'clear'
    | 'section_submit'
    | 'exam_submit'
    | 'open_calculator'
    | 'open_question_paper'
    | 'open_instructions';
  section?: string;
  question?: string;
  response?: ResponseValue | null;
  reason?: string;
}

// ---------------------------------------------------------------------------
// OUTPUT: result
// ---------------------------------------------------------------------------

export interface QuestionResult {
  id: string;
  number: number;
  type: QuestionType;
  status: QStatus;
  /** Committed response (null when not answered). */
  response: ResponseValue | null;
  /** Counted for evaluation: answered or answered&marked. */
  evaluated: boolean;
  timeSpentSec: number;
  visits: number;
  answerChanges: number;
  firstVisitedAt: string | null;
  lastSavedAt: string | null;
  /** Present only when an answer key was supplied. */
  correct?: boolean | null;
  marksAwarded?: number;
}

export interface SectionResult {
  id: string;
  name: string;
  startedAt: string | null;
  submittedAt: string | null;
  submitReason: 'manual' | 'timeout' | null;
  timeSpentSec: number;
  counts: Record<QStatus, number> & { total: number };
  score?: { marks: number; maxMarks: number; correct: number; incorrect: number; unattempted: number };
  questions: QuestionResult[];
}

export interface ExamResult {
  examId: string;
  title: string;
  candidate: ExamConfig['candidate'];
  timingMode: ExamConfig['timing']['mode'];
  startedAt: string | null;
  submittedAt: string | null;
  submitReason: 'manual' | 'timeout' | null;
  totalTimeSpentSec: number;
  sections: SectionResult[];
  score?: { marks: number; maxMarks: number; correct: number; incorrect: number; unattempted: number };
  events: ExamEvent[];
}
