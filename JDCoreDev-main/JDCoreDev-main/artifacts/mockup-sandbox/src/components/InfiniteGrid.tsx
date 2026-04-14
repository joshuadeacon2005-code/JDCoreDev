import { useRef, useId } from 'react';
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useAnimationFrame,
} from 'framer-motion';
import { cn } from '@/lib/utils';

const GridPattern = ({
  offsetX,
  offsetY,
  size,
  patternId,
}: {
  offsetX: any;
  offsetY: any;
  size: number;
  patternId: string;
}) => (
  <svg className="w-full h-full">
    <defs>
      <motion.pattern
        id={patternId}
        width={size}
        height={size}
        patternUnits="userSpaceOnUse"
        x={offsetX}
        y={offsetY}
      >
        <path
          d={`M ${size} 0 L 0 0 0 ${size}`}
          fill="none"
          stroke="#008080"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
      </motion.pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${patternId})`} />
  </svg>
);

interface InfiniteGridProps {
  className?: string;
  style?: React.CSSProperties;
  gridSize?: number;
  speedX?: number;
  speedY?: number;
  children?: React.ReactNode;
}

export function InfiniteGrid({
  className,
  style,
  gridSize = 40,
  speedX = 0.15,
  speedY = 0.15,
  children,
}: InfiniteGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgPatternId = useId();
  const hoverPatternId = useId();

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  useAnimationFrame(() => {
    gridOffsetX.set((gridOffsetX.get() + speedX) % gridSize);
    gridOffsetY.set((gridOffsetY.get() + speedY) % gridSize);
  });

  const maskImage = useMotionTemplate`radial-gradient(350px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={cn(
        'relative w-full flex flex-col items-center justify-center overflow-hidden',
        className
      )}
      style={style}
    >
      <div className="absolute inset-0 z-0 opacity-30">
        <GridPattern
          offsetX={gridOffsetX}
          offsetY={gridOffsetY}
          size={gridSize}
          patternId={`bg-${bgPatternId}`}
        />
      </div>
      <motion.div
        className="absolute inset-0 z-[1] opacity-80"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <GridPattern
          offsetX={gridOffsetX}
          offsetY={gridOffsetY}
          size={gridSize}
          patternId={`hover-${hoverPatternId}`}
        />
      </motion.div>
      {children}
    </div>
  );
}
