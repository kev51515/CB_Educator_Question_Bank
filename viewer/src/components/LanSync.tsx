/**
 * LanSync
 * =======
 * Local-network sync helper using BroadcastChannel for same-origin tabs.
 *
 * A full WebRTC/LAN bridge is intentionally stubbed: this hook is the
 * foundation that the rest of the app can talk to. Each tab generates a
 * unique source ID, broadcasts a periodic ping, and tracks peers that
 * have responded recently.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gatherState } from "./StateExport";

/* ─── Types ─── */

export interface SyncMessage {
  type: "state-snapshot" | "state-patch" | "ping" | "pong";
  timestamp: number;
  sourceId?: string;
  payload?: unknown;
}

interface UseLanSyncOptions {
  onMessage?: (msg: SyncMessage) => void;
  autoSyncInterval?: number;
}

interface UseLanSyncResult {
  broadcast: (msg: SyncMessage) => void;
  connected: boolean;
  peerCount: number;
  fullSync: () => void;
}

interface LanSyncIndicatorProps {
  connected: boolean;
  peerCount: number;
  onClick?: () => void;
}

/* ─── Helpers ─── */

function randomHexId(): string {
  // 8 hex chars = 32 bits; plenty for distinguishing local tabs.
  try {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Math.random().toString(16).slice(2, 10);
  }
}

const PEER_TTL_MS = 60_000;
const DEFAULT_PING_MS = 10_000;

/* ─── Hook ─── */

export function useLanSync(
  channelName: string,
  options?: UseLanSyncOptions,
): UseLanSyncResult {
  const sourceId = useMemo(() => randomHexId(), []);
  const channelRef = useRef<BroadcastChannel | null>(null);
  // Map of peerId -> last-seen timestamp (ms). Mutable ref + state mirror.
  const peersRef = useRef<Map<string, number>>(new Map());
  const [peerCount, setPeerCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const onMessage = options?.onMessage;
  const autoSyncInterval = options?.autoSyncInterval ?? DEFAULT_PING_MS;

  const recountPeers = useCallback(() => {
    const cutoff = Date.now() - PEER_TTL_MS;
    let mutated = false;
    for (const [id, ts] of peersRef.current) {
      if (ts < cutoff) {
        peersRef.current.delete(id);
        mutated = true;
      }
    }
    const size = peersRef.current.size;
    setPeerCount((prev) => (prev === size ? prev : size));
    return mutated;
  }, []);

  // Wire up the channel once per channelName.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      setConnected(false);
      return;
    }

    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel(channelName);
    } catch {
      setConnected(false);
      return;
    }
    channelRef.current = ch;
    setConnected(true);

    const handle = (event: MessageEvent) => {
      const data = event.data as SyncMessage | undefined;
      if (!data || typeof data !== "object" || typeof data.type !== "string") return;
      // Ignore our own echoes.
      if (data.sourceId && data.sourceId === sourceId) return;

      // Track peer.
      if (data.sourceId) {
        peersRef.current.set(data.sourceId, Date.now());
        setPeerCount(peersRef.current.size);
      }

      // Auto-respond to pings so the sender can count us.
      if (data.type === "ping" && channelRef.current) {
        try {
          channelRef.current.postMessage({
            type: "pong",
            timestamp: Date.now(),
            sourceId,
          } satisfies SyncMessage);
        } catch {
          /* non-fatal */
        }
      }

      if (onMessage) {
        try {
          onMessage(data);
        } catch {
          /* don't let consumer errors break sync */
        }
      }
    };

    ch.addEventListener("message", handle);

    return () => {
      ch.removeEventListener("message", handle);
      try {
        ch.close();
      } catch {
        /* non-fatal */
      }
      channelRef.current = null;
      setConnected(false);
    };
  }, [channelName, onMessage, sourceId]);

  // Periodic ping + peer cleanup.
  useEffect(() => {
    if (!connected) return;
    const interval = window.setInterval(() => {
      // Cleanup stale peers.
      recountPeers();
      // Broadcast ping.
      if (channelRef.current) {
        try {
          channelRef.current.postMessage({
            type: "ping",
            timestamp: Date.now(),
            sourceId,
          } satisfies SyncMessage);
        } catch {
          /* non-fatal */
        }
      }
    }, autoSyncInterval);
    return () => window.clearInterval(interval);
  }, [connected, autoSyncInterval, recountPeers, sourceId]);

  const broadcast = useCallback(
    (msg: SyncMessage) => {
      const ch = channelRef.current;
      if (!ch) return;
      try {
        ch.postMessage({
          ...msg,
          sourceId: msg.sourceId ?? sourceId,
          timestamp: msg.timestamp || Date.now(),
        });
      } catch {
        /* non-fatal */
      }
    },
    [sourceId],
  );

  const fullSync = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    try {
      const snapshot = gatherState();
      ch.postMessage({
        type: "state-snapshot",
        timestamp: Date.now(),
        sourceId,
        payload: snapshot,
      } satisfies SyncMessage);
    } catch {
      /* non-fatal — gatherState or postMessage failed */
    }
  }, [sourceId]);

  return { broadcast, connected, peerCount, fullSync };
}

/* ─── Indicator component ─── */

export function LanSyncIndicator({
  connected,
  peerCount,
  onClick,
}: LanSyncIndicatorProps): JSX.Element | null {
  if (peerCount === 0) return null;
  const dotClass = connected ? "bg-green-500" : "bg-ink-400";
  const label = `Synced (${peerCount})`;
  const content = (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-ink-700 bg-ink-100 border border-ink-200">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`}
        aria-hidden
      />
      {label}
    </span>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="focus-ring rounded-full"
        aria-label={`${label} — click to manage sync`}
      >
        {content}
      </button>
    );
  }
  return (
    <span role="status" aria-label={label}>
      {content}
    </span>
  );
}
