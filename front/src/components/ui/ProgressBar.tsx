import { cn } from '@/lib/utils';

interface ProgressBarProps {
  progress: number;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function ProgressBar({
  progress,
  className,
  showLabel = true,
  size = 'md',
  variant = 'default',
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const getVariantColor = () => {
    if (variant !== 'default') {
      const colors = {
        success: 'bg-green-500',
        warning: 'bg-yellow-500',
        error: 'bg-red-500',
      };
      return colors[variant];
    }
    // Auto color based on progress
    if (clampedProgress < 30) return 'bg-red-500';
    if (clampedProgress < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-sm text-gray-600">進捗</span>
          <span className="text-sm font-medium text-gray-900">
            {Math.round(clampedProgress)}%
          </span>
        </div>
      )}
      <div className={cn('w-full bg-gray-200 rounded-full overflow-hidden', sizes[size])}>
        <div
          className={cn('transition-all duration-500 ease-out', getVariantColor())}
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
