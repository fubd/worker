import { useEffect, useRef, useState } from 'react';

export function OverflowText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      setOverflowing(element.scrollWidth > element.clientWidth + 1);
    };

    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text]);

  return (
    <span
      ref={ref}
      className={className ? `swan-overflow-text ${className}` : 'swan-overflow-text'}
      title={overflowing ? text : undefined}
    >
      {text}
    </span>
  );
}
