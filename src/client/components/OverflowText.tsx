import { useEffect, useRef, useState } from 'react';
import { Tooltip } from 'antd';

export function OverflowText({
  text,
  className,
  onOverflowChange,
}: {
  text: string;
  className?: string;
  onOverflowChange?: (overflowing: boolean) => void;
}) {
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

  useEffect(() => {
    onOverflowChange?.(overflowing);
  }, [onOverflowChange, overflowing]);

  return (
    <Tooltip
      title={overflowing ? text : undefined}
      placement="topLeft"
      mouseEnterDelay={0.2}
      classNames={{ root: 'swan-overflow-tooltip' }}
      styles={{
        container: {
          maxWidth: 360,
          overflowWrap: 'anywhere',
          whiteSpace: 'normal',
        },
      }}
    >
      <span
        ref={ref}
        className={className ? `swan-overflow-text ${className}` : 'swan-overflow-text'}
      >
        {text}
      </span>
    </Tooltip>
  );
}
