import type { Metadata } from 'next';

import { StatsCard } from '@/features/dashboard/components/stats-card';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your Chefer dashboard',
};

// Server Component — data fetched directly
async function getDashboardStats() {
  // In production, fetch from tRPC or database
  return {
    totalUsers: 1_284,
    activeUsers: 847,
    totalPosts: 3_421,
    revenue: 12_840,
    userGrowth: 12.5,
    postGrowth: -3.2,
    revenueGrowth: 23.1,
    activeGrowth: 5.8,
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      change: stats.userGrowth,
      description: 'Registered accounts',
      icon: '👥',
    },
    {
      title: 'Active Users',
      value: stats.activeUsers.toLocaleString(),
      change: stats.activeGrowth,
      description: 'Active in last 30 days',
      icon: '🟢',
    },
    {
      title: 'Total Posts',
      value: stats.totalPosts.toLocaleString(),
      change: stats.postGrowth,
      description: 'Published content',
      icon: '📝',
    },
    {
      title: 'Revenue',
      value: `$${stats.revenue.toLocaleString()}`,
      change: stats.revenueGrowth,
      description: 'Monthly recurring',
      icon: '💰',
    },
  ] as const;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s what&apos;s happening with your platform.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatsCard key={card.title} {...card} />
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent Users</h2>
          <div className="space-y-3">
            {['Alice Johnson', 'Bob Smith', 'Carol White', 'David Brown', 'Eve Davis'].map(
              (name, i) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {i + 1} day{i !== 0 ? 's' : ''} ago
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-100">
                    Active
                  </span>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent Posts</h2>
          <div className="space-y-3">
            {[
              'Getting Started with TypeScript Monorepos',
              'Building Modern Web Apps with Next.js 15',
              'PostgreSQL Performance Tips',
              'Introduction to tRPC v11',
              'Docker Best Practices',
            ].map((title, i) => (
              <div key={title} className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-muted text-lg">
                  📝
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{i + 2} hours ago</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
