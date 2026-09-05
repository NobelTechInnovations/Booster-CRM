"use client";

import { useEffect, useRef, useState } from "react";

// Subtle fade+rise on scroll for the marketing homepage — nothing else in
// this app needed scroll-triggered motion before now. Deliberately starts
// in its FINAL visible state and only ever hides itself once this effect
// has actually run — a no-JS visit (or a crawler that doesn't execute JS)
// never sees empty/invisible content, it just skips the animation. Fully
// skipped under prefers-reduced-motion, per this app's own accessibility
// bar elsewhere (see the CSS media query in globals.css as a second,
// belt-and-suspenders guard).
export function Reveal({ children, as: Tag = "div", delay = 0, className = "", ...props }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return undefined;
    }
    setReady(true);
    const el = ref.current;

    // A hard fallback timer alongside the observer below — found live that
    // IntersectionObserver can simply never fire in some real environments
    // (this project's own preview/automation harness reproduced it: every
    // .reveal element stayed opacity:0 even scrolled far past). The same
    // "don't gate real content on an API that can silently fail" lesson
    // from this session's WhatsApp-polling document.hidden bug applies
    // here — a marketing homepage must never end up with content stuck
    // permanently invisible. Whichever fires first wins; this is purely a
    // backstop, not the primary mechanism.
    const fallback = window.setTimeout(() => setVisible(true), 1200);

    if (!el || typeof IntersectionObserver === "undefined") return () => window.clearTimeout(fallback);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  const classes = [className];
  if (ready) {
    classes.push("reveal");
    if (visible) classes.push("reveal-visible");
  }

  return (
    <Tag
      ref={ref}
      className={classes.filter(Boolean).join(" ")}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...props}
    >
      {children}
    </Tag>
  );
}
