interface GenerateOverlayProps {
  /** Premium runs the AI pipeline; free picks from the curated pool. */
  premium?: boolean;
}

export function GenerateOverlay({ premium = true }: GenerateOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-white px-10 py-10 shadow-xl">
        {/* Food loading animation */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/food-loading.svg" alt="" aria-hidden="true" className="h-32 w-32" />
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">
            {premium ? 'Crafting your week…' : 'Picking this week’s recipes…'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {premium
              ? 'Picking recipes tailored to your goals and preferences'
              : 'Selecting balanced meals from our chef-curated collection'}
          </p>
        </div>
      </div>
    </div>
  );
}
