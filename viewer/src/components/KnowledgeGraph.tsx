import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IndexEntry } from "@/types";
import { IDENTITY } from "@/lib/designTokens";
import { CONFIDENCE } from "@/lib/designSystem";
import { useFocusTrap } from "@/hooks";

// ─────────────────────────── types ───────────────────────────────

interface KnowledgeGraphProps {
  open: boolean;
  onClose: () => void;
  index: IndexEntry[];
  confidence: { getAll: () => Record<string, number> };
  done: Set<string>;
  onFilterSkill: (skill: string) => void;
}

interface Node {
  id: string; // skill name
  domain: string;
  count: number; // # questions
  avgConf: number; // 0 if no data, else 1..3
  radius: number;
  // physics
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  a: number; // node index
  b: number;
}

// ─────────────────────────── constants ───────────────────────────

const WORLD_W = 800;
const WORLD_H = 600;
const ITERATIONS = 200;
const REPULSION = 8000; // Coulomb-like constant
const SPRING_K = 0.02; // Hooke-like constant
const SPRING_REST = 110;
const DAMPING = 0.85;
const CENTER_PULL = 0.005;

// ─────────────────────────── helpers ─────────────────────────────

function nodeColor(avgConf: number): string {
  if (avgConf <= 0) return CONFIDENCE.unrated.canvasFill;
  if (avgConf < 1.5) return CONFIDENCE.unsure.canvasFill;
  if (avgConf <= 2.5) return CONFIDENCE.okay.canvasFill;
  return CONFIDENCE.confident.canvasFill;
}

function buildGraph(
  index: IndexEntry[],
  confidence: Record<string, number>,
): { nodes: Node[]; edges: Edge[] } {
  // Aggregate by skill
  interface Agg {
    domain: string;
    count: number;
    confSum: number;
    confN: number;
  }
  const bySkill = new Map<string, Agg>();
  for (const e of index) {
    if (!e.skill) continue;
    let agg = bySkill.get(e.skill);
    if (!agg) {
      agg = { domain: e.domain ?? "", count: 0, confSum: 0, confN: 0 };
      bySkill.set(e.skill, agg);
    }
    agg.count += 1;
    const c = confidence[e.id];
    if (typeof c === "number" && c >= 1 && c <= 3) {
      agg.confSum += c;
      agg.confN += 1;
    }
  }

  const counts = [...bySkill.values()].map((a) => a.count);
  const maxCount = Math.max(1, ...counts);

  const skills = [...bySkill.entries()];

  // Seed nodes on a circle to give the layout something to relax from.
  const nodes: Node[] = skills.map(([skill, agg], i) => {
    const angle = (i / Math.max(1, skills.length)) * Math.PI * 2;
    const r = Math.min(WORLD_W, WORLD_H) * 0.35;
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;
    const sqrtScale = Math.sqrt(agg.count / maxCount);
    const radius = Math.max(8, Math.min(30, 8 + sqrtScale * 22));
    return {
      id: skill,
      domain: agg.domain,
      count: agg.count,
      avgConf: agg.confN > 0 ? agg.confSum / agg.confN : 0,
      radius,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });

  // Edges: connect skills that share a domain.
  const byDomain = new Map<string, number[]>();
  nodes.forEach((n, idx) => {
    if (!n.domain) return;
    const arr = byDomain.get(n.domain) ?? [];
    arr.push(idx);
    byDomain.set(n.domain, arr);
  });

  const edges: Edge[] = [];
  for (const indices of byDomain.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        edges.push({ a: indices[i], b: indices[j] });
      }
    }
  }

  return { nodes, edges };
}

function relaxLayout(nodes: Node[], edges: Edge[], iterations: number): void {
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion: O(n²) but n is small (skill count).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          // Jitter overlapping nodes
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = dx * dx + dy * dy + 0.0001;
        }
        const force = REPULSION / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Spring attraction along edges
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
      const stretch = d - SPRING_REST;
      const f = SPRING_K * stretch;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Gentle pull toward centre to keep things on canvas
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER_PULL;
      n.vy += (cy - n.y) * CENTER_PULL;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
    }
  }
}

// ─────────────────────── KnowledgeGraph ──────────────────────────

export function KnowledgeGraph({
  open,
  onClose,
  index,
  confidence,
  done: _done,
  onFilterSkill,
}: KnowledgeGraphProps): JSX.Element | null {
  void _done; // kept for API completeness — currently unused for colouring

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  // Pan/zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Build graph + adjacency map (memoised so layout is only computed once per open/data change).
  const { nodes, edges, adjacency } = useMemo(() => {
    if (!open) return { nodes: [] as Node[], edges: [] as Edge[], adjacency: new Map<number, Set<number>>() };
    const g = buildGraph(index, confidence.getAll());
    relaxLayout(g.nodes, g.edges, ITERATIONS);
    const adj = new Map<number, Set<number>>();
    for (const e of g.edges) {
      if (!adj.has(e.a)) adj.set(e.a, new Set());
      if (!adj.has(e.b)) adj.set(e.b, new Set());
      adj.get(e.a)!.add(e.b);
      adj.get(e.b)!.add(e.a);
    }
    return { nodes: g.nodes, edges: g.edges, adjacency: adj };
  }, [open, index, confidence]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // ── render to canvas ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      // World → screen transform: centre world in canvas, then pan/zoom.
      const sx = cw / WORLD_W;
      const sy = ch / WORLD_H;
      const baseScale = Math.min(sx, sy);
      const scale = baseScale * zoom;
      const offsetX = cw / 2 - (WORLD_W / 2) * scale + pan.x;
      const offsetY = ch / 2 - (WORLD_H / 2) * scale + pan.y;

      const toScreenX = (x: number): number => x * scale + offsetX;
      const toScreenY = (y: number): number => y * scale + offsetY;

      const neighbours =
        hoverIdx != null ? adjacency.get(hoverIdx) ?? new Set<number>() : new Set<number>();

      // Edges
      for (const e of edges) {
        const isHi = hoverIdx != null && (e.a === hoverIdx || e.b === hoverIdx);
        ctx.strokeStyle = isHi ? "rgba(100,116,139,0.6)" : "rgba(148,163,184,0.2)";
        ctx.lineWidth = isHi ? 1.5 : 1;
        ctx.beginPath();
        const a = nodes[e.a];
        const b = nodes[e.b];
        ctx.moveTo(toScreenX(a.x), toScreenY(a.y));
        ctx.lineTo(toScreenX(b.x), toScreenY(b.y));
        ctx.stroke();
      }

      // Nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const isHover = i === hoverIdx;
        const isNeighbour = neighbours.has(i);
        const dim = hoverIdx != null && !isHover && !isNeighbour;

        ctx.beginPath();
        ctx.arc(toScreenX(n.x), toScreenY(n.y), n.radius * Math.sqrt(zoom), 0, Math.PI * 2);
        ctx.fillStyle = nodeColor(n.avgConf);
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.fill();
        ctx.lineWidth = isHover ? 2 : 1;
        ctx.strokeStyle = isHover ? "#0f172a" : "rgba(15,23,42,0.4)";
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Label
        ctx.font = `${Math.max(10, 11 * Math.sqrt(zoom))}px system-ui, sans-serif`;
        ctx.fillStyle = dim ? "rgba(71,85,105,0.5)" : "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const labelY = toScreenY(n.y) + n.radius * Math.sqrt(zoom) + 2;
        ctx.fillText(n.id, toScreenX(n.x), labelY);
      }
    };

    draw();
    const onResize = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [open, nodes, edges, adjacency, zoom, pan, hoverIdx]);

  // ── pointer interactions ────────────────────────────────────────

  /** Convert client (mouse) coords to world coords, accounting for current transform. */
  const clientToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      const sx = cw / WORLD_W;
      const sy = ch / WORLD_H;
      const baseScale = Math.min(sx, sy);
      const scale = baseScale * zoom;
      const offsetX = cw / 2 - (WORLD_W / 2) * scale + pan.x;
      const offsetY = ch / 2 - (WORLD_H / 2) * scale + pan.y;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      return { x: (px - offsetX) / scale, y: (py - offsetY) / scale };
    },
    [zoom, pan],
  );

  /** Hit-test in world space (so radius compares correctly). */
  const hitTest = useCallback(
    (clientX: number, clientY: number): number | null => {
      const w = clientToWorld(clientX, clientY);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = w.x - n.x;
        const dy = w.y - n.y;
        if (dx * dx + dy * dy <= n.radius * n.radius) return i;
      }
      return null;
    },
    [nodes, clientToWorld],
  );

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (dragRef.current) {
      const d = dragRef.current;
      setPan({ x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) });
      return;
    }
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== hoverIdx) setHoverIdx(idx);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: pan.x,
      baseY: pan.y,
    };
  };

  const onMouseUp = (): void => {
    dragRef.current = null;
  };

  const onMouseLeave = (): void => {
    dragRef.current = null;
    setHoverIdx(null);
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    // Suppress click if this was a pan (small movement = click).
    const idx = hitTest(e.clientX, e.clientY);
    if (idx == null) return;
    onFilterSkill(nodes[idx].id);
    onClose();
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.max(0.3, Math.min(4, z * (1 + delta))));
  };

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="knowledge-graph-title"
      className={"fixed inset-0 z-50 flex flex-col bg-white border-t-[3px] " + IDENTITY.topic.topBorder}
    >
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2">
        <h2 id="knowledge-graph-title" className="text-base font-semibold text-ink-900">
          Knowledge Graph
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-ink-300 px-2 py-1 text-xs hover:bg-ink-100 focus-ring"
            onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="text-xs text-ink-500 tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="rounded border border-ink-300 px-2 py-1 text-xs hover:bg-ink-100 focus-ring"
            onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="rounded border border-ink-300 px-2 py-1 text-xs hover:bg-ink-100 focus-ring"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset
          </button>
          <button
            type="button"
            data-close
            data-autofocus
            className="rounded border border-ink-300 px-3 py-1 text-xs hover:bg-ink-100 focus-ring"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-ink-50">
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-grab active:cursor-grabbing"
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          onWheel={onWheel}
          aria-label="Skill knowledge graph"
        />
      </div>

      <div className="border-t border-ink-200 px-4 py-2 text-xs text-ink-500">
        <span className="mr-3">
          Node size = question count · color = average confidence
        </span>
        <span className="inline-flex items-center gap-1 mr-3">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-400" /> Struggling
        </span>
        <span className="inline-flex items-center gap-1 mr-3">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Okay
        </span>
        <span className="inline-flex items-center gap-1 mr-3">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Confident
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-ink-300" /> No data
        </span>
      </div>
    </div>
  );
}
