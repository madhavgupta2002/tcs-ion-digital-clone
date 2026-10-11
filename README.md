# CBT Exam Engine

A browser-based computer-based-test (CBT) engine whose layout and behaviour follow the interface used at Indian exam centres: section tabs, a countdown timer, a status palette, mark for review, an on-screen calculator, and a numeric keypad for type-in answers.

It has two screens, the instructions (2 pages) and the exam itself. It has no login. You supply an **exam config JSON** as input, and the engine produces a **result JSON** as output.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine unit tests
npm run build        # static build in dist/
```

Open `/?exam=sample.json` (sectional timers) or `/?exam=sample-global.json` (one timer). With no parameter, a picker lists `public/exams/index.json` and lets you upload a JSON file.

### Supplying a config

The engine checks these in order:

1. `window.EXAM_CONFIG = {...}`, set by a host page before the bundle loads
2. `?config=<url>`, any URL that returns the JSON
3. `?exam=<file>`, a file in `public/exams/`
4. The picker or upload screen

Configs are validated on load. Errors list every problem, with its path.

## Input: `ExamConfig`

The full types are in [`src/types.ts`](src/types.ts).

```jsonc
{
  "id": "mock-1",                       // also the localStorage key suffix
  "title": "Mock Test 1",               // yellow title, top-left
  "candidate": { "name": "A. Student", "rollNo": "R001", "photoUrl": "…" },

  "timing": {
    "mode": "sectional",                // "sectional" | "global"
    "totalDurationSec": 7200,           // required for global
    "warnAtSec": 300                    // timer turns red below this
  },

  "defaults": { "marks": 3, "negativeMarks": 1, "titaNegativeMarks": 0 },

  "features": {
    "calculator": true, "questionPaper": true, "viewInstructions": true,
    "showMarks": true, "confirmSubmit": true, "showResultSummary": true
  },

  "instructions": {                     // optional overrides; text is generated from config otherwise
    "generalHtml": "<p>…</p>", "otherHtml": "<p>…</p>", "declaration": "I agree …"
  },

  "output": { "postUrl": "https://…/results", "postMessage": true, "localStorage": true },

  "sections": [
    {
      "id": "qa", "name": "Quantitative Ability",
      "durationSec": 2400,              // required for sectional
      "minTimeSec": 0,                  // Submit is disabled until this much time has passed
      "marks": 3, "negativeMarks": 1, "titaNegativeMarks": 0,
      "calculator": true,
      "passages": [ { "id": "p1", "directions": "<b>…</b>", "html": "<p>…</p>" } ],
      "questions": [
        { "id": "q1", "type": "MCQ",  "html": "…", "options": [{ "id": "A", "html": "…" }], "answer": "A" },
        { "id": "q2", "type": "MSQ",  "html": "…", "options": [ … ], "answer": ["A", "C"] },
        { "id": "q3", "type": "TITA", "html": "…", "answer": "2.5", "tolerance": 0.01 },
        { "id": "q4", "type": "MCQ",  "passageId": "p1", "html": "…", "options": [ … ] }
      ]
    }
  ]
}
```

| Concept | Behaviour |
|---|---|
| `MCQ` | Radio buttons, a single answer |
| `MSQ` | Checkboxes. Scored only on an exact set match |
| `TITA` | A read-only box plus an on-screen keypad. Accepts digits, one `.`, and a leading `-` |
| `passageId` | Shows the passage in a resizable left pane, with the question on the right |
| Marks | Resolved per question, then section, then `defaults`, then 3 / 1 / 0 |
| `answer` | Optional. When present, the result includes correctness and a score |
| HTML | Question, option, passage, and instruction fields render raw HTML from the config, so load only configs you trust |
| `sectional` | One clock per section. Sections run in order, and other tabs are locked. At zero the section auto-submits and the next one starts |
| `global` | A single clock. Tabs switch freely. At zero the whole exam auto-submits |

### Palette behaviour

| Action | Effect |
|---|---|
| Opening a question | Not Visited → Not Answered |
| **Save & Next** | Commits the selection: Answered, or Not Answered if it is empty |
| **Mark for review and Next** | Answered & Marked if a selection exists, otherwise Marked |
| **Clear Response** | Clears the saved answer. Answered & Marked becomes Marked |
| Palette, tab, or other navigation | **Discards an unsaved selection**, matching the real interface |
| Last question | Wraps to Q1 (sectional) or moves to the next section (global) |

Answered & Marked questions **are evaluated**. Marked questions without an answer are not.

Progress is kept in `sessionStorage`, so a refresh resumes the attempt. The clock runs on wall time, so time keeps passing while the page is closed.

## Output: `ExamResult`

On submit, the result is delivered through every enabled channel:

- `localStorage["tcs-clone-result:<examId>"]`
- `window.parent.postMessage({ type: "tcs-clone-result", result }, "*")` when embedded in an iframe
- a `tcs-clone-result` `CustomEvent` on `window`, with `detail = result`
- `POST output.postUrl`, with a JSON body
- a **Download Result (JSON)** button on the final screen

```jsonc
{
  "examId": "mock-1", "title": "…", "candidate": { … }, "timingMode": "sectional",
  "startedAt": "2026-10-11T16:30:00.000Z", "submittedAt": "…",
  "submitReason": "manual",             // "manual" | "timeout"
  "totalTimeSpentSec": 6123.4,
  "score": { "marks": 41, "maxMarks": 69, "correct": 16, "incorrect": 7, "unattempted": 0 },
  "sections": [{
    "id": "qa", "name": "…", "startedAt": "…", "submittedAt": "…", "submitReason": "timeout",
    "timeSpentSec": 2400,
    "counts": { "total": 8, "notVisited": 0, "notAnswered": 1, "answered": 5, "marked": 1, "answeredMarked": 1 },
    "score": { … },
    "questions": [{
      "id": "q1", "number": 1, "type": "MCQ",
      "status": "answered",             // notVisited | notAnswered | answered | marked | answeredMarked
      "response": ["B"],                // MCQ/MSQ: option ids; TITA: string; null if none
      "evaluated": true,
      "timeSpentSec": 84.2, "visits": 3, "answerChanges": 2,
      "firstVisitedAt": "…", "lastSavedAt": "…",
      "correct": true, "marksAwarded": 3 // only present when an answer key was supplied
    }]
  }],
  "events": [ { "t": 1791736200000, "type": "save", "section": "qa", "question": "q1", "response": ["B"] } ]
}
```

The `events` array logs `exam_start`, `section_start`, `visit`, `save`, `mark`, `clear`, `section_submit`, `exam_submit`, `open_calculator`, `open_question_paper`, and `open_instructions`.

## Project layout

```
src/
  types.ts                  input / runtime / output types
  engine/reducer.ts         state machine (statuses, navigation, clocks)
  engine/result.ts          result builder, scoring, delivery
  engine/loadConfig.ts      config resolution + validation
  engine/engine.test.ts     unit tests
  screens/                  Instructions (2 pages), ExamPage, Done, ExamPicker
  components/               StatusIcon, Calculator, TitaKeypad, Modal,
                            InstructionsModal, QuestionPaperModal, SubmitConfirm, Avatar
public/exams/               sample configs
```

The visual layout follows reference screenshots. Instruction wording and sample questions are original, and no third-party logos or branding are included.
