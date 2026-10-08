interface SidebarResizerProps {
  width: number;
  onWidthChange: (width: number) => void;
  onCollapse: () => void;
  minWidth?: number;
  maxWidth?: number;
  collapseThreshold?: number;
  label?: string;
}

export default function SidebarResizer({
  width,
  onWidthChange,
  onCollapse,
  minWidth = 220,
  maxWidth = 600,
  collapseThreshold = 196,
  label = "Resize file explorer",
}: SidebarResizerProps) {
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const requestedWidth = startWidth + moveEvent.clientX - startX;
      if (requestedWidth <= collapseThreshold) {
        cleanup();
        onCollapse();
        return;
      }
      onWidthChange(Math.max(minWidth, Math.min(maxWidth, requestedWidth)));
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (width <= minWidth) onCollapse();
      else onWidthChange(Math.max(minWidth, width - step));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onWidthChange(Math.min(maxWidth, width + step));
    }
    if (event.key === "Home") {
      event.preventDefault();
      onWidthChange(minWidth);
    }
    if (event.key === "End") {
      event.preventDefault();
      onWidthChange(maxWidth);
    }
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className="group absolute inset-y-0 z-30 hidden w-2 cursor-col-resize touch-none items-center justify-center bg-transparent outline-hidden sm:flex"
      style={{ left: `${width}px` }}
      onPointerDown={startResize}
      onDoubleClick={onCollapse}
      onKeyDown={handleKeyDown}
      title="Drag left to close; double-click to close"
    >
      <span className="h-12 w-0.5 rounded-full bg-[hsl(var(--obsidian-accent))] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  );
}
