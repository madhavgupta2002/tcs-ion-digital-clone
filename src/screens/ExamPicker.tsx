import { useEffect, useState } from 'react';
import './done.css';

interface Entry {
  file: string;
  title: string;
}

/** Shown when no config is supplied via window.EXAM_CONFIG / ?config= / ?exam=. */
export function ExamPicker({ onPick }: { onPick: (raw: unknown) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}exams/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      onPick(JSON.parse(await f.text()));
    } catch (e) {
      setErr(`Could not parse ${f.name}: ${(e as Error).message}`);
    }
  };

  return (
    <div className="done">
      <div className="done-band" />
      <div className="done-card">
        <h2>Select an exam</h2>
        <ul style={{ fontSize: 16, lineHeight: 2 }}>
          {entries.map((e) => (
            <li key={e.file}>
              <a href={`?exam=${encodeURIComponent(e.file)}`}>{e.title}</a>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 24 }}>
          Or load your own exam config (JSON):{' '}
          <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
        </p>
        {err && <p style={{ color: '#b00' }}>{err}</p>}
      </div>
    </div>
  );
}
