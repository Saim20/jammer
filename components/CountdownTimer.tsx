'use client';

interface CountdownTimerProps {
  timeLeft: number;
  totalTime?: number;
}

export default function CountdownTimer({
  timeLeft,
  totalTime = 10,
}: CountdownTimerProps) {
  const pct = Math.max(0, (timeLeft / totalTime) * 100);

  const barColor =
    timeLeft > 6
      ? 'bg-emerald-500'
      : timeLeft > 3
        ? 'bg-yellow-500'
        : 'bg-red-500';

  const textColor =
    timeLeft > 6
      ? 'text-emerald-400'
      : timeLeft > 3
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div className="flex items-center gap-3 w-full max-w-[200px]">
      {/* Numeric countdown */}
      <span
        className={`text-2xl font-mono font-black min-w-[2ch] text-right tabular-nums transition-colors ${textColor} ${timeLeft <= 3 ? 'animate-pulse' : ''}`}
      >
        {timeLeft}
      </span>

      {/* Progress bar */}
      <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
