export function GenerateOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-white px-10 py-10 shadow-xl">
        {/* Animated chef hat / spinner */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
          <span className="text-2xl" aria-hidden="true">🍽️</span>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">Crafting your week…</p>
          <p className="mt-1 text-sm text-gray-500">
            Picking recipes tailored to your goals and preferences
          </p>
        </div>
      </div>
    </div>
  );
}
