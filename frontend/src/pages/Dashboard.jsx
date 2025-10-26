import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  BookX,
  CheckCircle2,
  Flame,
  Layers3,
  RefreshCw,
  Sparkles,
  Users,
  UserCog,
  UserX,
} from 'lucide-react';
import { bookAPI, generationAPI, trainingAPI, userAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const normaliseCollection = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
};

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const formatRelativeTime = (value) => {
  const date = toValidDate(value);
  if (!date) return 'moments ago';

  const now = Date.now();
  let delta = (date.getTime() - now) / 1000;

  const divisions = [
    { amount: 60, unit: 'seconds' },
    { amount: 60, unit: 'minutes' },
    { amount: 24, unit: 'hours' },
    { amount: 7, unit: 'days' },
    { amount: 4.34524, unit: 'weeks' },
    { amount: 12, unit: 'months' },
    { amount: Infinity, unit: 'years' },
  ];

  for (const { amount, unit } of divisions) {
    if (Math.abs(delta) < amount) {
      return relativeTimeFormatter.format(Math.round(delta), unit.slice(0, -1));
    }
    delta /= amount;
  }
  return 'moments ago';
};

const formatNumber = (value) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value ?? 0);

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
};

const STAT_CARDS = [
  {
    key: 'totalBooks',
    label: 'Books in library',
    icon: BookOpen,
  },
  {
    key: 'activeBooks',
    label: 'Active books',
    icon: BookOpenCheck,
  },
  {
    key: 'inactiveBooks',
    label: 'Inactive books',
    icon: BookX,
  },
  {
    key: 'generatedBooks',
    label: 'Books generated',
    icon: Layers3,
  },
  {
    key: 'totalUsers',
    label: 'Enrolled users',
    icon: Users,
  },
  {
    key: 'trainedUsers',
    label: 'Users ready for generation',
    icon: UserCog,
  },
  {
    key: 'failedUsers',
    label: 'Users needing attention',
    icon: UserX,
  },
  {
    key: 'activeTrainings',
    label: 'Active trainings',
    icon: Activity,
  },
];

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessages, setErrorMessages] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [collections, setCollections] = useState({
    books: [],
    users: [],
    trainings: [],
    generations: [],
  });

  const fetchOverview = useCallback(async ({ silent = false } = {}) => {
    setErrorMessages([]);

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const requests = [
      ['books', () => bookAPI.getAll()],
      ['users', () => userAPI.getAll()],
      ['trainings', () => trainingAPI.getAll()],
      ['generations', () => generationAPI.getAll()],
    ];

    const results = await Promise.allSettled(requests.map(([, request]) => request()));
    const nextData = {
      books: [],
      users: [],
      trainings: [],
      generations: [],
    };
    const nextErrors = [];

    results.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === 'fulfilled') {
        nextData[key] = normaliseCollection(result.value);
      } else {
        const message = result.reason?.message || `${key} unavailable`;
        nextErrors.push(`${key}: ${message}`);
      }
    });

    setCollections(nextData);
    setLastUpdated(new Date().toISOString());
    setErrorMessages(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const bookStats = useMemo(() => {
    const { books } = collections;
    const total = books.length;
    const active = books.filter((book) => book.status === 'active').length;
    const inactive = books.filter((book) => book.status === 'inactive').length;
    const generated = collections.generations.filter(
      (generation) => generation.status === 'succeeded'
    ).length;
    const totalPages = books.reduce(
      (sum, book) => sum + (Array.isArray(book.pages) ? book.pages.length : 0),
      0
    );
    const avgPages = total ? totalPages / total : 0;
    return {
      total,
      active,
      inactive,
      generated,
      avgPages,
    };
  }, [collections]);

  const trainingStats = useMemo(() => {
    const { trainings } = collections;
    const total = trainings.length;
    const activeStatuses = new Set(['queued', 'starting', 'processing']);
    const active = trainings.filter((item) => activeStatuses.has(item.status)).length;
    const failed = trainings.filter((item) => item.status === 'failed');
    const succeeded = trainings.filter((item) => item.status === 'succeeded');
    const byUser = new Map();
    trainings.forEach((training) => {
      if (!training?.userId) return;
      const bucket = byUser.get(training.userId) || { attempts: 0, successes: 0, failures: 0 };
      bucket.attempts += 1;
      if (training.status === 'succeeded') bucket.successes += 1;
      if (training.status === 'failed') bucket.failures += 1;
      byUser.set(training.userId, bucket);
    });
    const failedUsers = Array.from(byUser.values()).filter((item) => item.failures > 0).length;
    const readyUsers = Array.from(byUser.values()).filter((item) => item.successes > 0).length;
    const successRate = total ? (succeeded.length / total) * 100 : 0;
    return {
      total,
      active,
      failed: failed.length,
      failedUsers,
      readyUsers,
      successRate,
    };
  }, [collections]);

  const userStats = useMemo(() => {
    const { users } = collections;
    const total = users.length;
    const imageAssets = users.reduce(
      (sum, user) => sum + (Array.isArray(user.imageAssets) ? user.imageAssets.length : 0),
      0
    );
    const avgImages = total ? imageAssets / total : 0;
    return {
      total,
      imageAssets,
      avgImages,
    };
  }, [collections]);

  const generationStats = useMemo(() => {
    const { generations } = collections;
    const total = generations.length;
    const succeeded = generations.filter((item) => item.status === 'succeeded').length;
    const failed = generations.filter((item) => item.status === 'failed').length;
    const queued = generations.filter((item) => item.status === 'queued').length;
    const successRate = total ? (succeeded / Math.max(total, 1)) * 100 : 0;
    return {
      total,
      succeeded,
      failed,
      queued,
      successRate,
    };
  }, [collections]);

  const statCardValues = useMemo(() => {
    return {
      totalBooks: {
        value: bookStats.total,
        delta: bookStats.avgPages ? `${formatNumber(bookStats.avgPages)} pages / book` : null,
      },
      activeBooks: {
        value: bookStats.active,
        delta: bookStats.total
          ? `${formatPercent((bookStats.active / bookStats.total) * 100)} active`
          : null,
      },
      inactiveBooks: {
        value: bookStats.inactive,
        delta: bookStats.total
          ? `${formatPercent((bookStats.inactive / bookStats.total) * 100)} inactive`
          : null,
      },
      generatedBooks: {
        value: bookStats.generated,
        delta: generationStats.successRate ? `${formatPercent(generationStats.successRate)} success` : null,
      },
      totalUsers: {
        value: userStats.total,
        delta: userStats.avgImages
          ? `${formatNumber(userStats.avgImages)} photos / user`
          : null,
      },
      trainedUsers: {
        value: trainingStats.readyUsers,
        delta: trainingStats.total
          ? `${formatPercent((trainingStats.readyUsers / Math.max(userStats.total, 1)) * 100)} ready`
          : null,
      },
      failedUsers: {
        value: trainingStats.failedUsers,
        tone: 'warning',
        delta: trainingStats.failed ? `${formatNumber(trainingStats.failed)} failed runs` : null,
      },
      activeTrainings: {
        value: trainingStats.active,
        delta: trainingStats.total
          ? `${formatPercent((trainingStats.active / Math.max(trainingStats.total, 1)) * 100)} in-flight`
          : null,
      },
    };
  }, [bookStats, generationStats, trainingStats, userStats]);

  const activityFeed = useMemo(() => {
    const events = [];

    collections.books.forEach((book) => {
      const timestamp = book.updatedAt || book.createdAt;
      const date = toValidDate(timestamp);
      if (!date) return;
      events.push({
        id: `book-${book._id}`,
        type: 'Book',
        icon: BookOpen,
        title: book.name || 'Untitled book',
        status: book.status === 'active' ? 'Live' : 'Draft',
        timestamp: date,
        href: '/books',
      });
    });

    collections.trainings.forEach((training) => {
      const timestamp = training.updatedAt || training.createdAt;
      const date = toValidDate(timestamp);
      if (!date) return;
      events.push({
        id: `training-${training._id}`,
        type: 'Training',
        icon: Flame,
        title: training.modelName || 'Training job',
        status: training.status || 'pending',
        timestamp: date,
        href: '/training',
      });
    });

    collections.generations.forEach((generation) => {
      const timestamp = generation.updatedAt || generation.createdAt;
      const date = toValidDate(timestamp);
      if (!date) return;
      events.push({
        id: `generation-${generation._id}`,
        type: 'Generation',
        icon: Sparkles,
        title: generation.prompt?.slice(0, 48) || 'New generation',
        status: generation.status || 'queued',
        timestamp: date,
        href: '/generate',
      });
    });

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 8);
  }, [collections]);

  const healthSummary = useMemo(() => {
    const trainingLoad = trainingStats.total
      ? (trainingStats.active / Math.max(trainingStats.total, 1)) * 100
      : 0;
    const generationSuccess = generationStats.successRate;
    const attentionItems = trainingStats.failedUsers;
    const systemScore =
      (Math.min(trainingLoad, 100) * 0.3 + Math.min(generationSuccess, 100) * 0.5 + Math.max(100 - attentionItems * 5, 0) * 0.2) /
      1;
    return {
      trainingLoad,
      generationSuccess,
      attentionItems,
      systemScore: Math.round(systemScore),
    };
  }, [generationStats.successRate, trainingStats]);

  const handleRefresh = () => {
    fetchOverview({ silent: true });
  };

  return (
    <div className="page-wrapper">
      <section className="dashboard-hero space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-foreground/50">
              Operations overview
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Stay ahead of every book, training, and generation run.
            </h1>
            <p className="mt-3 text-sm text-foreground/70">
              Scan high-impact metrics at a glance and jump into the right tool when something needs your attention.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              className="border-white/20 bg-white/10 text-foreground/80 hover:bg-white/20"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn(
                  'mr-2 h-4 w-4 transition-transform duration-500',
                  refreshing && 'animate-spin'
                )}
              />
              {refreshing ? 'Refreshing…' : 'Refresh data'}
            </Button>
            <Button asChild>
              <Link to="/books">
                New book
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>
        <div className="flex flex-wrap gap-3 text-xs text-foreground/70">
          <span className="badge-ghost">
            <Sparkles className="h-3 w-3 text-accent" />
            {formatPercent(generationStats.successRate)} generation success
          </span>
          <span className="badge-ghost">
            <Users className="h-3 w-3 text-sky-300" />
            {formatNumber(userStats.total)} active users
          </span>
          <span className="badge-ghost">
            <Flame className="h-3 w-3 text-orange-300" />
            {formatNumber(trainingStats.total)} training runs
          </span>
          {lastUpdated && (
            <span className="badge-ghost">
              <CheckCircle2 className="h-3 w-3 text-emerald-300" />
              Updated {formatRelativeTime(lastUpdated)}
            </span>
          )}
        </div>
      </section>

      {errorMessages.length > 0 && (
        <div className="panel border border-amber-500/30 bg-amber-500/10 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-200" />
            <div>
              <p className="font-medium">Some data could not be refreshed.</p>
              <p className="mt-1 text-foreground/75">
                {errorMessages.join(' • ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Key metrics</h2>
          <Badge variant="outline" className="bg-white/10 text-foreground/70">
            {formatNumber(activityFeed.length)} recent updates
          </Badge>
        </div>
        <div className="stat-grid">
          {STAT_CARDS.map(({ key, label, icon: Icon }) => {
            const stat = statCardValues[key] ?? {};
            return (
              <article key={key} className="stat-card">
                <div className="flex items-center justify-between">
                  <p className="stat-card__title">{label}</p>
                  <span className="rounded-xl bg-white/10 p-2">
                    <Icon className="h-5 w-5 text-accent/80" />
                  </span>
                </div>
                <p className="stat-card__value">{formatNumber(stat.value)}</p>
                {stat.delta && (
                  <p
                    className={cn(
                      'stat-card__meta',
                      stat.tone === 'warning' ? 'text-amber-300' : 'text-emerald-300'
                    )}
                  >
                    {stat.delta}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <article className="panel">
          <header className="panel-header">
            <div>
              <h3 className="panel-title">Latest activity</h3>
              <p className="text-xs text-foreground/60">
                Books, trainings, and generations arriving in chronological order.
              </p>
            </div>
          </header>
          <div className="mt-5 space-y-3">
            {activityFeed.length === 0 && !loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-foreground/70">
                No recent actions. Kick things off with a new book or training run.
              </div>
            ) : (
              activityFeed.map((event) => (
                <Link
                  key={event.id}
                  to={event.href}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-transparent bg-transparent p-4 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-white/10 p-2">
                      <event.icon className="h-5 w-5 text-accent/80" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold tracking-tight text-foreground">
                        {event.title}
                      </p>
                      <p className="text-xs text-foreground/55">
                        {event.status ? `${event.status} • ` : ''}
                        {formatRelativeTime(event.timestamp)}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-foreground/50 transition group-hover:text-accent" />
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="panel space-y-4">
          <header className="panel-header">
            <div>
              <h3 className="panel-title">System health</h3>
              <p className="text-xs text-foreground/60">At-a-glance readiness across the stack.</p>
            </div>
            <div className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200">
              {formatPercent(healthSummary.systemScore)} healthy
            </div>
          </header>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Training capacity</span>
                <span>{formatPercent(healthSummary.trainingLoad)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-accent to-purple-400"
                  style={{ width: `${Math.min(healthSummary.trainingLoad, 100)}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Generation success</span>
                <span>{formatPercent(healthSummary.generationSuccess)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-400 to-emerald-500"
                  style={{ width: `${Math.min(healthSummary.generationSuccess, 100)}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-foreground/65">
              <p className="flex items-center gap-2 font-medium text-foreground/75">
                <BarChart3 className="h-4 w-4 text-accent" />
                Focus points
              </p>
              <p className="mt-2">
                {healthSummary.attentionItems ? (
                  <>
                    Review {formatNumber(healthSummary.attentionItems)} user
                    {healthSummary.attentionItems === 1 ? '' : 's'} marked for follow-up to keep the pipeline clear.
                  </>
                ) : (
                  'All systems nominated as healthy. Keep monitoring for new training runs.'
                )}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="panel space-y-5">
          <header className="panel-header">
            <div>
              <h3 className="panel-title">Training pipeline</h3>
              <p className="text-xs text-foreground/60">Where models stand right now.</p>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-200">
              {formatPercent(trainingStats.successRate)} success
            </Badge>
          </header>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/55">Active</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {formatNumber(trainingStats.active)}
              </p>
              <p className="mt-1 text-xs text-foreground/60">Currently running jobs</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/55">Ready</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {formatNumber(trainingStats.readyUsers)}
              </p>
              <p className="mt-1 text-xs text-foreground/60">Users ready to generate</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/55">Needs review</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-200">
                {formatNumber(trainingStats.failedUsers)}
              </p>
              <p className="mt-1 text-xs text-foreground/60">Users flagged for action</p>
            </div>
          </div>
          <div className="space-y-3 text-xs text-foreground/60">
            <p>
              • Restart failed runs with updated datasets to recover {formatPercent(Math.min(trainingStats.successRate + 6, 100))}{' '}
              success rates.
            </p>
            <p>• Promote ready users to the generation queue to keep outputs flowing.</p>
          </div>
        </article>

        <article className="panel space-y-4">
          <header className="panel-header">
            <div>
              <h3 className="panel-title">Quick actions</h3>
              <p className="text-xs text-foreground/60">Tackle the next priority in seconds.</p>
            </div>
          </header>
          <div className="grid gap-3">
            <Button
              asChild
              variant="secondary"
              className="justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-5 text-left text-sm font-semibold hover:bg-white/20"
            >
              <Link to="/users">
                Enroll a new user
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              className="justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-5 text-left text-sm font-semibold hover:bg-white/20"
            >
              <Link to="/generate">
                Launch image generation
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-between rounded-2xl border border-white/10 bg-transparent px-4 py-5 text-left text-sm font-semibold hover:bg-white/10"
            >
              <Link to="/automate">
                Configure automation workflow
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-foreground/65">
            <p className="flex items-center gap-2 font-medium text-foreground/75">
              <Sparkles className="h-4 w-4 text-accent" />
              Pro tip
            </p>
            <p className="mt-2">
              Keep the dashboard clean by clearing failed trainings after you re-run them. The health score reflects resolved items immediately.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

export default Dashboard;
