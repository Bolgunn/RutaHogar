import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
const usePositionEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function FieldTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const [cloudStyle, setCloudStyle] = useState({});
  const [arrowOffset, setArrowOffset] = useState(12);
  const [placement, setPlacement] = useState("top");
  const ref = useRef(null);
  const btnRef = useRef(null);
  const cloudRef = useRef(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target) && !cloudRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;

    const MARGIN = 12;
    const GAP = 10;
    let cloudWidth = Math.min(360, window.innerWidth - MARGIN * 2);

    const rect = btnRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    if (cloudRef.current) cloudRef.current.style.width = `${cloudWidth}px`;
    let cloudHeight = cloudRef.current?.getBoundingClientRect().height || 120;
    const above = rect.top - GAP - MARGIN;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    // Widen long explanations before repositioning; never constrain their height.
    if (cloudHeight > Math.max(above, below) && cloudRef.current) {
      cloudWidth = Math.min(480, window.innerWidth - MARGIN * 2);
      cloudRef.current.style.width = `${cloudWidth}px`;
      cloudHeight = cloudRef.current.getBoundingClientRect().height;
    }
    const opensBelow = above < cloudHeight && below > above;
    const preferredTop = opensBelow ? rect.bottom + GAP : rect.top - GAP - cloudHeight;
    const top = Math.max(MARGIN, Math.min(preferredTop, window.innerHeight - cloudHeight - MARGIN));

    let left = rect.left + rect.width / 2 - cloudWidth / 2;
    left = Math.max(MARGIN, Math.min(left, viewportWidth - cloudWidth - MARGIN));

    const iconCenterX = rect.left + rect.width / 2;
    const arrowLeft = iconCenterX - left;

    setArrowOffset(Math.max(10, Math.min(arrowLeft, cloudWidth - 10)));
    setPlacement(opensBelow ? "bottom" : "top");
    setCloudStyle({ top, left, bottom: "auto", transform: "none", width: cloudWidth, maxHeight: "none", overflow: "visible" });
  }, []);

  usePositionEffect(() => {
    if (!open) return;

    updatePosition();
    const handleEscape = (event) => { if (event.key === "Escape") setOpen(false); };

    // Recalcula en cada scroll o resize mientras está abierto
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, updatePosition]);

  return (
    <span className="field-tooltip-wrap" ref={ref}>
      <button
        type="button"
        ref={btnRef}
        className={`field-tooltip-btn ${open ? "is-open" : ""}`}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((prev) => !prev); }}
        onKeyDown={(event) => { if (["Enter", " ", "Escape"].includes(event.key)) event.stopPropagation(); if (event.key === "Escape") setOpen(false); }}
        aria-label="Ayuda"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
      >
        <i className="ti ti-help-circle" />
      </button>

      {open && createPortal(
        <div
          className={`field-tooltip-cloud field-tooltip-cloud--${placement}`}
          role="tooltip"
          id={tooltipId}
          style={cloudStyle}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          ref={(el) => {
            cloudRef.current = el;
            if (el) el.style.setProperty("--arrow-left", `${arrowOffset}px`);
          }}
        >
          {text}
        </div>, document.body
      )}
    </span>
  );
}
