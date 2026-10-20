import { CalendarDays, Dumbbell } from 'lucide-react';

/** Schedule (M3) and Workouts (M2) until they ship: the tab exists, its content says what is coming. */
export function ComingSoon({
  heading,
  title,
  body,
  icon,
}: {
  heading: string;
  title: string;
  body: string;
  icon: 'schedule' | 'workouts';
}) {
  const Icon = icon === 'schedule' ? CalendarDays : Dumbbell;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{heading}</h1>
      <section
        aria-labelledby="trainer-coming-soon-title"
        className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center sm:p-8"
        data-testid="trainer-coming-soon"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff3e8] text-[#944a00]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 id="trainer-coming-soon-title" className="font-semibold text-gray-900">
          {title}
        </h2>
        <p className="max-w-sm text-sm text-gray-600">{body}</p>
      </section>
    </div>
  );
}
