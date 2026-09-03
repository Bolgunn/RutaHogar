import React, { useCallback, useEffect, useRef, useState } from "react";

export default function FieldTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const [cloudStyle, setCloudStyle] = useState({});
  const [arrowOffset, setArrowOffset] = useState(12);
  const [placement, setPlacement] = useState("top");
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;

    const CLOUD_WIDTH = 260;
    const MARGIN = 12;
    const GAP = 10;

    const rect = btnRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const cloudHeight = 120;
    const opensBelow = rect.top < cloudHeight + GAP + MARGIN;

    let left = rect.left + rect.width / 2 - CLOUD_WIDTH / 2;
    left = Math.max(MARGIN, Math.min(left, viewportWidth - CLOUD_WIDTH - MARGIN));

    const iconCenterX = rect.left + rect.width / 2;
    const arrowLeft = iconCenterX - left;

    setArrowOffset(Math.max(10, Math.min(arrowLeft, CLOUD_WIDTH - 10)));
    setPlacement(opensBelow ? "bottom" : "top");
    setCloudStyle(
      opensBelow
        ? { top: rect.bottom + GAP, left, bottom: "auto", transform: "none" }
        : { bottom: window.innerHeight - rect.top + GAP, left, top: "auto", transform: "none" },
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    // Recalcula en cada scroll o resize mientras está abierto
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <span className="field-tooltip-wrap" ref={ref}>
      <button
        type="button"
        ref={btnRef}
        className={`field-tooltip-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Ayuda"
      >
        <i className="ti ti-help-circle" />
      </button>

      {open && (
        <div
          className={`field-tooltip-cloud field-tooltip-cloud--${placement}`}
          role="tooltip"
          style={cloudStyle}
          ref={(el) => {
            if (el) el.style.setProperty("--arrow-left", `${arrowOffset}px`);
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
