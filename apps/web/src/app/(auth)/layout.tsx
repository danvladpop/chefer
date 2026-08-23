// Shared warm backdrop for the auth pages so signing up feels like the same
// product as the cream/brown app shell (review L-1).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-gradient-to-b from-[#fff3e8] to-white">{children}</div>;
}
