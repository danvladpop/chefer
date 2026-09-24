export default function RoutineEditLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-500" />
        <p className="text-sm text-gray-500">Loading the editor…</p>
      </div>
    </div>
  );
}
