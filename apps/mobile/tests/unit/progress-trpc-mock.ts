// The slice of a hand-written `src/lib/trpc` mock that Kitchen progress needs
// (profile.flags + progress.*), with the feature OFF: every query answers
// "nothing", `finishCook` is a no-op mutation. Spread it into a test's own
// `trpc` object: `trpc: { ...progressTrpcOff(), … }`. Tests that exercise
// Kitchen progress itself use the real client harness (friends-core-harness).

type Query = { data: undefined; isError: false; isLoading: false; refetch: () => void };

export function progressTrpcOff() {
  const query = (): Query => ({
    data: undefined,
    isError: false,
    isLoading: false,
    refetch: () => undefined,
  });
  const mutation = () => ({ mutate: jest.fn(), isPending: false });
  return {
    profile: { flags: { useQuery: query } },
    progress: {
      availability: { useQuery: query },
      summary: { useQuery: query },
      inbox: { useQuery: query },
      achievements: { useQuery: query },
      receiptFor: { useQuery: query },
      weeklyRecap: { useQuery: query },
      finishCook: { useMutation: mutation },
      markSeen: { useMutation: mutation },
      ack: { useMutation: mutation },
      updateSettings: { useMutation: mutation },
      setActiveDayGoal: { useMutation: mutation },
      pauseFlame: { useMutation: mutation },
      resumeFlame: { useMutation: mutation },
    },
  };
}
