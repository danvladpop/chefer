export default function MealPlanLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
        <p className="text-sm text-gray-500">Loading your meal plan…</p>
      </div>
    </div>
  );
}
