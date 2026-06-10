/**
 * ReferenceSheet
 * ==============
 * The standard Digital SAT Math reference sheet (the fixed formula card the
 * College Board provides for every math module). Shown as a dismissible
 * floating panel — non-modal, like DesmosCalculator, so a test-taker can keep
 * it open beside a question. Used in both the test runner (FullTestApp) and
 * review mode, gated to math modules. Content is universal (not per-test).
 */
interface ReferenceSheetProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  label: string;
  formula: string;
}

const AREAS: Item[] = [
  { label: "Circle", formula: "A = πr²,  C = 2πr" },
  { label: "Rectangle", formula: "A = ℓw" },
  { label: "Triangle", formula: "A = ½bh" },
  { label: "Right triangle", formula: "a² + b² = c²" },
];

const VOLUMES: Item[] = [
  { label: "Rectangular solid", formula: "V = ℓwh" },
  { label: "Cylinder", formula: "V = πr²h" },
  { label: "Sphere", formula: "V = 4⁄3 πr³" },
  { label: "Cone", formula: "V = 1⁄3 πr²h" },
  { label: "Pyramid", formula: "V = 1⁄3 ℓwh" },
];

const TRIANGLES: Item[] = [
  { label: "30°–60°–90°", formula: "sides  x : x√3 : 2x" },
  { label: "45°–45°–90°", formula: "sides  s : s : s√2" },
];

const FACTS: string[] = [
  "The number of degrees of arc in a circle is 360.",
  "The number of radians of arc in a circle is 2π.",
  "The sum of the measures in degrees of the angles of a triangle is 180.",
];

function Row({ label, formula }: Item) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-mono text-slate-900 dark:text-slate-100">{formula}</span>
    </div>
  );
}

export function ReferenceSheet({ open, onClose }: ReferenceSheetProps) {
  if (!open) return null;
  return (
    <div
      className="fixed left-4 top-24 z-30 flex max-h-[70vh] w-[320px] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      role="dialog"
      aria-label="Math reference sheet"
    >
      <div className="flex items-center justify-between bg-slate-800 px-3 py-2 text-white">
        <span className="select-none text-sm font-semibold">Reference</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
          aria-label="Close reference sheet"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Area &amp; circumference</p>
        {AREAS.map((i) => <Row key={i.label} {...i} />)}
        <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Special right triangles</p>
        {TRIANGLES.map((i) => <Row key={i.label} {...i} />)}
        <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Volume</p>
        {VOLUMES.map((i) => <Row key={i.label} {...i} />)}
        <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Facts</p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
          {FACTS.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </div>
    </div>
  );
}
