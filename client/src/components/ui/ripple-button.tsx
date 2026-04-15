import { ReactNode, useState, useMemo, MouseEvent, CSSProperties } from 'react';

interface RippleState {
  key: number;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface RippleButtonProps {
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
  rippleColor?: string;
  rippleDuration?: number;
}

const JS_RIPPLE_KEYFRAMES = `
  @keyframes js-ripple-animation {
    0% { transform: scale(0); opacity: 1; }
    100% { transform: scale(1); opacity: 0; }
  }
  .animate-js-ripple-effect {
    animation: js-ripple-animation var(--ripple-duration) ease-out forwards;
  }
`;

export const RippleButton = ({
  children,
  onClick,
  className = '',
  disabled = false,
  rippleColor,
  rippleDuration = 600,
}: RippleButtonProps) => {
  const [jsRipples, setJsRipples] = useState<RippleState[]>([]);

  const determinedJsRippleColor = useMemo(() => {
    if (rippleColor) {
      return rippleColor;
    }
    return 'var(--button-ripple-color, rgba(255, 255, 255, 0.3))';
  }, [rippleColor]);

  const createJsRipple = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    const newRipple: RippleState = { key: Date.now(), x, y, size, color: determinedJsRippleColor };
    setJsRipples(prev => [...prev, newRipple]);
    setTimeout(() => {
      setJsRipples(currentRipples => currentRipples.filter(r => r.key !== newRipple.key));
    }, rippleDuration);
  };

  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      createJsRipple(event);
      if (onClick) onClick(event);
    }
  };

  const baseClasses = "relative border-none overflow-hidden isolate transition-all duration-200 cursor-pointer";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "";
  const buttonClasses = `${baseClasses} ${disabledClasses} ${className}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: JS_RIPPLE_KEYFRAMES }} />
      <button className={buttonClasses} onClick={handleButtonClick} disabled={disabled}>
        <span className="relative z-[1] pointer-events-none">{children}</span>
        <div className="absolute inset-0 pointer-events-none z-[5]">
          {jsRipples.map(ripple => (
            <span
              key={ripple.key}
              className="absolute rounded-full animate-js-ripple-effect"
              style={{
                left: ripple.x, 
                top: ripple.y, 
                width: ripple.size, 
                height: ripple.size,
                backgroundColor: ripple.color,
                ['--ripple-duration' as string]: `${rippleDuration}ms`,
              } as CSSProperties}
            />
          ))}
        </div>
      </button>
    </>
  );
};
