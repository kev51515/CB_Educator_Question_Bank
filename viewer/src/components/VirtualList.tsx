import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode, UIEvent } from "react";

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  containerStyle?: CSSProperties;
  renderItem: (item: T, index: number) => ReactNode;
  scrollToIndex?: number;
  ariaLabel?: string;
  role?: string;
}

export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element {
  const {
    items,
    itemHeight,
    overscan = 5,
    className,
    containerStyle,
    renderItem,
    scrollToIndex,
    ariaLabel,
    role,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number>(0);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const totalHeight = items.length * itemHeight;

  // Track viewport height via ResizeObserver
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h =
          entry.contentRect?.height ?? (entry.target as HTMLElement).clientHeight;
        setViewportHeight(h);
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  // Re-clamp scroll position when items length changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, totalHeight - el.clientHeight);
    if (el.scrollTop > maxScroll) {
      el.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [totalHeight]);

  // scrollToIndex effect
  useEffect(() => {
    if (scrollToIndex === undefined || scrollToIndex === null) return;
    const el = containerRef.current;
    if (!el) return;
    if (scrollToIndex < 0 || scrollToIndex >= items.length) return;

    const itemTop = scrollToIndex * itemHeight;
    const itemBottom = itemTop + itemHeight;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;

    if (itemTop < viewTop) {
      el.scrollTop = itemTop;
    } else if (itemBottom > viewBottom) {
      el.scrollTop = itemBottom - el.clientHeight;
    }
  }, [scrollToIndex, itemHeight, items.length]);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = e.currentTarget.scrollTop;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const visibleCount = Math.max(
    1,
    Math.ceil((viewportHeight || 0) / itemHeight)
  );
  const rawStart = Math.floor(scrollTop / itemHeight) - overscan;
  const startIndex = Math.max(0, rawStart);
  const endIndex = Math.min(
    items.length,
    startIndex + visibleCount + overscan * 2
  );

  const visibleItems: ReactNode[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    if (item === undefined) continue;
    visibleItems.push(
      <div
        key={i}
        style={{
          position: "absolute",
          top: `${i * itemHeight}px`,
          left: 0,
          right: 0,
          height: `${itemHeight}px`,
        }}
      >
        {renderItem(item, i)}
      </div>
    );
  }

  const mergedStyle: CSSProperties = {
    position: "relative",
    height: "100%",
    overflowY: "auto",
    ...containerStyle,
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={
        className
          ? `${className} thin-scrollbar`
          : "thin-scrollbar overflow-y-auto"
      }
      style={mergedStyle}
      role={role}
      aria-label={ariaLabel}
    >
      <div
        style={{
          position: "relative",
          height: `${totalHeight}px`,
          width: "100%",
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}

export default VirtualList;
