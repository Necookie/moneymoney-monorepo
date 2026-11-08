'use client';

import { AndroidAppCard } from '@/features/android/android-app-card';
import { SignOutButton, UserButton } from '@clerk/nextjs';
import type { Category, Settings } from '@mm/api-client';
import {
  DEFAULT_APP_FEATURES,
  type AppFeature,
  type AppFeatures,
  type CategoryKind,
} from '@mm/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { ErrorState, PageHeader, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, Segmented, Switch } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { moneyToInput, readMoney } from '@/lib/format';
import { invalidateKeys, qk, useCategories, useGoals, useMe } from '@/lib/queries';
import { useCsvExport } from '@/features/transactions/csv-dialogs';

const COMMON_TIMEZONES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const FEATURE_METADATA: Record<AppFeature, { title: string; description: string }> = {
  calendar: {
    title: 'Financial Calendar',
    description:
      'Track upcoming bills, salaries, and recurring expense schedules on a visual calendar.',
  },
  forecast: {
    title: 'Cash Flow Forecast',
    description:
      'Explore daily balance projections across 7d, 30d, 90d, and 12m, plus what-if scenarios.',
  },
  afford: {
    title: 'Can I afford this?',
    description:
      'Simulate purchase impact without risking upcoming obligations or your safety buffer.',
  },
  budgets: {
    title: 'Budgets',
    description: 'Set monthly limits by category or overall, and monitor daily spending allowance.',
  },
  goals: {
    title: 'Goals',
    description: 'Track progress toward savings targets and safeguard your emergency reserve.',
  },
  accounts: {
    title: 'Accounts',
    description: 'Dedicated screen for cash, bank, e-wallet, savings, and credit liabilities.',
  },
  insights: {
    title: 'Insights',
    description: 'Proactive alerts for spending pace, upcoming shortfalls, and safety buffer dips.',
  },
};

export function SettingsPage() {
  const me = useMe();
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Features, safety buffer, data and your account." />
      {me.isPending ? (
        <Card className="p-5">
          <SkeletonRows rows={4} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <FeaturesCard
            key={`features-${me.data.settings.updatedAt}`}
            settings={me.data.settings}
          />
          <PreferencesCard key={me.data.settings.updatedAt} settings={me.data.settings} />
          <div className="flex flex-col gap-4">
            <DemoCard demoMode={me.data.settings.demoMode} />
            <DataCard />
            <AccountCard email={me.data.email} />
          </div>
          <AndroidAppCard />
          <CategoriesCard />
        </div>
      )}
    </div>
  );
}

function FeaturesCard({ settings }: { settings: Settings }) {
  const api = useApi();
  const qc = useQueryClient();
  const [features, setFeatures] = useState<AppFeatures>({
    ...DEFAULT_APP_FEATURES,
    ...(settings.features ?? {}),
  });

  const save = useMutation({
    mutationFn: (next: Partial<AppFeatures>) => api.settings.update({ features: next }),
    onSuccess: () => {
      toast.success('Feature settings saved');
    },
    onError: () => {
      toast.error('Failed to update feature settings');
      setFeatures({
        ...DEFAULT_APP_FEATURES,
        ...(settings.features ?? {}),
      });
    },
    onSettled: () => invalidateKeys(qc, [qk.me, qk.dashboard]),
  });

  const onToggle = (feature: AppFeature, enabled: boolean) => {
    const next = { ...features, [feature]: enabled };
    setFeatures(next);
    save.mutate({ [feature]: enabled });
  };

  const featureKeys: AppFeature[] = [
    'calendar',
    'forecast',
    'afford',
    'budgets',
    'goals',
    'accounts',
    'insights',
  ];

  return (
    <Card>
      <CardHeader
        title="Features"
        description="Choose which features are active. Toggled-off features are hidden from navigation and dashboards."
      />
      <CardContent>
        <div className="divide-y divide-border">
          {featureKeys.map((key) => {
            const meta = FEATURE_METADATA[key];
            const enabled = features[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-ink">{meta.title}</span>
                  <span className="text-[12px] text-muted">{meta.description}</span>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => onToggle(key, checked)}
                  disabled={save.isPending}
                  aria-label={`Toggle ${meta.title}`}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PreferencesCard({ settings }: { settings: Settings }) {
  const api = useApi();
  const qc = useQueryClient();
  const goals = useGoals();
  const [buffer, setBuffer] = useState(moneyToInput(settings.safetyBuffer));
  const [timezone, setTimezone] = useState(settings.timezone);
  const [emergencyId, setEmergencyId] = useState(settings.emergencyFundGoalId ?? '');
  const [errors, setErrors] = useState<{ buffer?: string; timezone?: string }>({});

  const save = useMutation({
    mutationFn: (body: {
      safetyBuffer: number;
      timezone: string;
      emergencyFundGoalId: string | null;
    }) => api.settings.update(body),
    onSuccess: () => toast.success('Settings saved'),
    onSettled: () =>
      invalidateKeys(qc, [qk.me, qk.dashboard, qk.forecast, qk.alerts, qk.budgets, qk.planner]),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const parsed = buffer.trim()
      ? readMoney(buffer, { allowZero: true })
      : ({ ok: true, value: 0 } as const);
    if (!parsed.ok) next.buffer = parsed.error;
    if (!isValidTimeZone(timezone)) next.timezone = 'Unknown IANA timezone';
    setErrors(next);
    if (!parsed.ok || Object.keys(next).length) return;
    save.mutate({
      safetyBuffer: parsed.value,
      timezone,
      emergencyFundGoalId: emergencyId || null,
    });
  }

  const zones = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  return (
    <Card>
      <CardHeader
        title="Forecast & safety"
        description="These shape Safe to spend, alerts and affordability checks."
      />
      <CardContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            label="Safety buffer"
            htmlFor="set-buffer"
            error={errors.buffer}
            hint="The minimum balance you want to keep. Safe to spend and alerts treat dipping below it as a warning."
          >
            <MoneyInput
              id="set-buffer"
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
            />
          </Field>
          <Field
            label="Timezone"
            htmlFor="set-tz"
            error={errors.timezone}
            hint="Decides what “today” is for balances, budgets and the calendar."
          >
            <NativeSelect
              id="set-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Emergency fund goal"
            htmlFor="set-ef"
            hint="Affordability checks warn when a purchase would eat into this reserve."
          >
            <NativeSelect
              id="set-ef"
              value={emergencyId}
              onChange={(e) => setEmergencyId(e.target.value)}
            >
              <option value="">None</option>
              {(goals.data ?? [])
                .filter((g) => !g.archived || g.id === emergencyId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <div>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DemoCard({ demoMode }: { demoMode: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const load = useMutation({
    mutationFn: () => api.demo.load(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success('Demo data loaded');
    },
  });
  const clear = useMutation({
    mutationFn: () => api.demo.clear(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success('Demo data removed');
    },
  });
  return (
    <Card>
      <CardHeader
        title="Demo data"
        action={demoMode ? <Badge tone="warning">On</Badge> : <Badge tone="outline">Off</Badge>}
      />
      <CardContent>
        <p className="text-sm text-muted">
          Sample accounts, transactions and planned items, always flagged with a banner. Removing it
          deletes only demo records — your own data is untouched.
        </p>
        <div className="mt-4">
          {demoMode ? (
            <Button
              variant="destructive-outline"
              disabled={clear.isPending}
              onClick={() => setConfirm(true)}
            >
              {clear.isPending ? 'Removing…' : 'Remove demo data'}
            </Button>
          ) : (
            <Button variant="outline" disabled={load.isPending} onClick={() => load.mutate()}>
              {load.isPending ? 'Loading…' : 'Load demo data'}
            </Button>
          )}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove all demo data?"
        description="Demo accounts, transactions, planned items, budgets and goals will be deleted."
        confirmLabel="Remove demo data"
        destructive
        pending={clear.isPending}
        onConfirm={() => {
          clear.mutate();
          setConfirm(false);
        }}
      />
    </Card>
  );
}

function DataCard() {
  const exp = useCsvExport();
  return (
    <Card>
      <CardHeader title="Import & export" />
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={exp.isPending} onClick={() => exp.mutate({})}>
          <Icon name="download" size={16} />
          {exp.isPending ? 'Exporting…' : 'Export all transactions (CSV)'}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/transactions?import=1">
            <Icon name="upload" size={16} />
            Import CSV
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AccountCard({ email }: { email: string | null }) {
  return (
    <Card>
      <CardHeader title="Your account" />
      <CardContent className="flex flex-wrap items-center gap-4">
        <UserButton />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{email ?? 'Signed in'}</p>
          <p className="text-[12px] text-muted">Private single-user instance</p>
        </div>
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="outline" size="sm">
            <Icon name="logOut" size={14} />
            Sign out
          </Button>
        </SignOutButton>
      </CardContent>
    </Card>
  );
}

function CategoriesCard() {
  const categories = useCategories();
  const api = useApi();
  const qc = useQueryClient();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const create = useMutation({
    mutationFn: () => api.categories.create({ name: name.trim(), kind }),
    onSuccess: (c) => {
      toast.success(`Category “${c.name}” added`);
      setName('');
    },
    onSettled: () => invalidateKeys(qc, [qk.categories]),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; archived?: boolean }) =>
      api.categories.update(id, body),
    onSuccess: () => setRenaming(null),
    onSettled: () => invalidateKeys(qc, [qk.categories, qk.dashboard, qk.budgets]),
  });

  const list = (categories.data ?? []).filter((c) => c.kind === kind);

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Categories"
        description="Archived categories stay on past transactions but are hidden from pickers."
        action={
          <Segmented
            label="Category kind"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
          />
        }
      />
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input
            aria-label="New category name"
            placeholder={`New ${kind} category`}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="default" disabled={!name.trim() || create.isPending}>
            Add
          </Button>
        </form>
        {categories.isError ? (
          <ErrorState
            className="mt-4"
            error={categories.error}
            compact
            onRetry={() => void categories.refetch()}
          />
        ) : categories.isPending ? (
          <SkeletonRows rows={4} className="mt-4" />
        ) : (
          <ul className="mt-4 grid gap-x-6 sm:grid-cols-2">
            {list.map((c: Category) => (
              <li key={c.id} className="flex items-center gap-2 border-b py-2">
                {renaming?.id === c.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renaming.name.trim())
                        update.mutate({ id: c.id, name: renaming.name.trim() });
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label={`Rename ${c.name}`}
                      className="h-8"
                      value={renaming.name}
                      maxLength={120}
                      onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                    />
                    <Button type="submit" size="sm" disabled={update.isPending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className={c.archived ? 'flex-1 text-muted line-through' : 'flex-1'}>
                      {c.name}
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Rename ${c.name}`}
                      onClick={() => setRenaming({ id: c.id, name: c.name })}
                    >
                      <Icon name="edit" size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update.mutate({ id: c.id, archived: !c.archived })}
                    >
                      {c.archived ? 'Restore' : 'Archive'}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
