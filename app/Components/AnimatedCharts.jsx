"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";

const CHARTS = [
  "/3d/bar.png",
  "/3d/donut.png",
  "/3d/line.png",
  "/3d/pie.png",
  "/3d/Scatter.png",
];

const DOUBLE_CHARTS = [...CHARTS, ...CHARTS];

const LAYOUTS = {
  login: [
    { x: 9, y: 14, size: 134, opacity: 0.78, speed: 0.00035, spin: 0.01 },
    { x: 24, y: 8, size: 116, opacity: 0.68, speed: 0.0005, spin: -0.013 },
    { x: 81, y: 16, size: 122, opacity: 0.68, speed: 0.00045, spin: 0.012 },
    { x: 92, y: 30, size: 130, opacity: 0.75, speed: 0.00042, spin: -0.009 },
    { x: 8, y: 39, size: 112, opacity: 0.62, speed: 0.00048, spin: 0.014 },
    { x: 13, y: 69, size: 138, opacity: 0.82, speed: 0.0003, spin: -0.01 },
    { x: 28, y: 85, size: 116, opacity: 0.62, speed: 0.00052, spin: 0.012 },
    { x: 79, y: 73, size: 126, opacity: 0.76, speed: 0.0004, spin: -0.01 },
    { x: 91, y: 57, size: 116, opacity: 0.64, speed: 0.00046, spin: 0.013 },
    { x: 69, y: 88, size: 142, opacity: 0.84, speed: 0.00033, spin: -0.008 },
  ],
  signup: [
    { x: 10, y: 12, size: 128, opacity: 0.72, speed: 0.00044, spin: 0.011 },
    { x: 22, y: 24, size: 118, opacity: 0.66, speed: 0.0005, spin: -0.01 },
    { x: 87, y: 14, size: 136, opacity: 0.74, speed: 0.00037, spin: 0.01 },
    { x: 93, y: 36, size: 112, opacity: 0.66, speed: 0.0005, spin: -0.013 },
    { x: 9, y: 49, size: 124, opacity: 0.7, speed: 0.00043, spin: 0.012 },
    { x: 7, y: 77, size: 136, opacity: 0.8, speed: 0.00033, spin: -0.01 },
    { x: 28, y: 90, size: 114, opacity: 0.64, speed: 0.0005, spin: 0.015 },
    { x: 81, y: 70, size: 134, opacity: 0.74, speed: 0.00041, spin: -0.009 },
    { x: 90, y: 53, size: 116, opacity: 0.62, speed: 0.00052, spin: 0.014 },
    { x: 68, y: 88, size: 140, opacity: 0.82, speed: 0.00034, spin: -0.01 },
  ],
  landing: [
    { x: 4, y: 10, size: 154, opacity: 0.62, speed: 0.0003, spin: 0.008 },
    { x: 16, y: 20, size: 132, opacity: 0.58, speed: 0.00035, spin: -0.01 },
    { x: 34, y: 8, size: 120, opacity: 0.55, speed: 0.00042, spin: 0.011 },
    { x: 90, y: 15, size: 156, opacity: 0.62, speed: 0.00029, spin: -0.008 },
    { x: 98, y: 34, size: 132, opacity: 0.54, speed: 0.00037, spin: 0.012 },
    { x: 2, y: 68, size: 144, opacity: 0.6, speed: 0.00032, spin: -0.009 },
    { x: 19, y: 86, size: 126, opacity: 0.56, speed: 0.0004, spin: 0.013 },
    { x: 73, y: 78, size: 142, opacity: 0.58, speed: 0.00033, spin: -0.01 },
    { x: 96, y: 62, size: 126, opacity: 0.55, speed: 0.0004, spin: 0.012 },
    { x: 58, y: 94, size: 146, opacity: 0.63, speed: 0.00028, spin: -0.008 },
  ],
};

export default function AnimatedCharts({ layout = "login", className = "" }) {
  const containerRef = useRef(null);
  const itemRefs = useRef([]);

  const config = useMemo(() => {
    if (layout === "landing") {
      return LAYOUTS.landing.map((item, index) => ({
        ...item,
        src: DOUBLE_CHARTS[index % DOUBLE_CHARTS.length],
      }));
    }

    const selected = LAYOUTS[layout] || LAYOUTS.login;
    return selected.map((item, index) => ({
      ...item,
      src: DOUBLE_CHARTS[index],
    }));
  }, [layout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pointers = {
      x: -10_000,
      y: -10_000,
    };

    const entries = config.map((item, index) => {
      const node = itemRefs.current[index];
      return {
        node,
        ...item,
        phase: index * 1.41,
        verticalPhase: index * 1.93,
      };
    });

    const onPointerMove = (event) => {
      const rect = container.getBoundingClientRect();
      pointers.x = event.clientX - rect.left;
      pointers.y = event.clientY - rect.top;
    };

    const onPointerLeave = () => {
      pointers.x = -10_000;
      pointers.y = -10_000;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);

    let raf = 0;

    const tick = (time) => {
      const containerRect = container.getBoundingClientRect();

      for (const entry of entries) {
        if (!entry.node) continue;

        const orbitX = Math.sin(time * entry.speed + entry.phase) * 18;
        const orbitY = Math.cos(time * (entry.speed * 0.85) + entry.verticalPhase) * 12;

        const baseX = (entry.x / 100) * containerRect.width;
        const baseY = (entry.y / 100) * containerRect.height;

        const currentX = baseX + orbitX;
        const currentY = baseY + orbitY;

        const dx = currentX - pointers.x;
        const dy = currentY - pointers.y;
        const distance = Math.hypot(dx, dy);

        const repelRadius = 180;
        let repelX = 0;
        let repelY = 0;

        if (distance < repelRadius) {
          const force = (1 - distance / repelRadius) * 48;
          const nx = dx / (distance || 1);
          const ny = dy / (distance || 1);
          repelX = nx * force;
          repelY = ny * force;
        }

        const angle = time * entry.spin + entry.phase * 16;

        entry.node.style.transform = `translate3d(${orbitX + repelX}px, ${orbitY + repelY}px, 0) rotate(${angle}deg)`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [config]);

  return (
    <div ref={containerRef} className={className}>
      {config.map((item, index) => (
        <div
          key={`${item.src}-${index}`}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          className="absolute will-change-transform"
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            width: `${item.size}px`,
            height: `${item.size}px`,
            opacity: item.opacity,
            pointerEvents: "none",
            transform: "translate3d(0, 0, 0)",
          }}
        >
          <Image
            src={item.src}
            alt=""
            width={item.size}
            height={item.size}
            className="h-full w-full object-contain select-none"
            draggable={false}
            priority={layout === "landing" && index < 3}
          />
        </div>
      ))}
    </div>
  );
}
