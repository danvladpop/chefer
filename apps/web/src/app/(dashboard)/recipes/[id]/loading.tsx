export default function RecipeDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-6 py-8">
      {/* Back link skeleton */}
      <div className="mb-6 h-4 w-32 rounded bg-gray-200" />
      {/* Hero */}
      <div className="mb-6 h-56 w-full rounded-2xl bg-gray-200" />
      {/* Title */}
      <div className="mb-2 h-8 w-2/3 rounded bg-gray-200" />
      <div className="mb-6 h-4 w-1/3 rounded bg-gray-200" />
      {/* Content blocks */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="mb-3 h-4 rounded bg-gray-200" />
      ))}
    </div>
  );
}
