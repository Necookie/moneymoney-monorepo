'use client';

import type { CsvImportResult } from '@mm/api-client';
import { formatDate, formatMoney } from '@mm/finance-engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AccountSelect } from '@/components/form-controls';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/misc';
import { useApi } from '@/lib/api';
import { downloadText } from '@/lib/download';
import { TRANSACTION_TYPE_LABEL } from '@/lib/format';
import { invalidateFinancial, useAccounts, useToday, type TransactionFilters } from '@/lib/queries';

const MAX_BYTES = 5_000_000;

/** Upload → server dry run (preview + errors) → confirm import. Nothing is saved before confirm. */
export function CsvImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ImportFlow onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [preview, setPreview] = useState<CsvImportResult | null>(null);

  const dryRun = useMutation({
    mutationFn: () =>
      api.transactions.importCsv({
        csv: csv!,
        defaultAccountId: defaultAccountId || undefined,
        dryRun: true,
      }),
    onSuccess: setPreview,
  });

  const commit = useMutation({
    mutationFn: () =>
      api.transactions.importCsv({
        csv: csv!,
        defaultAccountId: defaultAccountId || undefined,
        dryRun: false,
      }),
    onSuccess: async (result) => {
      await invalidateFinancial(qc);
      toast.success(`Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'}`, {
        description:
          result.skippedDuplicates > 0
            ? `${result.skippedDuplicates} duplicate(s) skipped`
            : undefined,
      });
      onClose();
    },
  });

  async function onFile(file: File | undefined) {
    setPreview(null);
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFileError('File is larger than 5 MB.');
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
  }

  const canImport = preview && preview.errors.length === 0 && preview.preview.length > 0;

  return (
    <DialogContent
      size="lg"
      title="Import transactions from CSV"
      description="We'll check the file first. Nothing is saved until you confirm."
    >
      <DialogBody>
        <div className="rounded-[10px] border bg-canvas/60 p-3 text-[12px] text-muted">
          <p className="font-medium text-ink-soft">Expected columns (header row required)</p>
          <code className="mt-1 block font-mono text-[11px] break-all text-ink">
            date,type,amount,account,to_account,category,description,notes,tags
          </code>
          <p className="mt-1">
            Only <b>date</b> and <b>amount</b> are required. Dates as YYYY-MM-DD or MM/DD/YYYY.
            Without a <b>type</b> column, negative amounts are expenses and positive amounts are
            income. Re-importing the same file skips duplicates.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CSV file" htmlFor="csv-file" error={fileError}>
            <input
              ref={fileRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full cursor-pointer rounded-input border border-border-strong bg-card text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-hover file:px-3 file:py-2.5 file:text-sm file:font-medium"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </Field>
          <Field
            label="Default account"
            htmlFor="csv-account"
            optional
            hint="Used when the file has no account column"
          >
            <AccountSelect
              id="csv-account"
              accounts={accounts.data ?? []}
              value={defaultAccountId}
              onChange={(v) => {
                setDefaultAccountId(v);
                setPreview(null);
              }}
              placeholder="None"
            />
          </Field>
        </div>

        {preview ? <ImportPreview result={preview} /> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {preview && canImport ? (
          <Button variant="primary" disabled={commit.isPending} onClick={() => commit.mutate()}>
            {commit.isPending
              ? 'Importing…'
              : `Import ${preview.preview.length} transaction${preview.preview.length === 1 ? '' : 's'}`}
          </Button>
        ) : (
          <Button
            variant="default"
            disabled={!csv || dryRun.isPending}
            onClick={() => dryRun.mutate()}
          >
            {dryRun.isPending
              ? 'Checking…'
              : preview
                ? 'Check again'
                : `Check ${fileName || 'file'}`}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function ImportPreview({ result }: { result: CsvImportResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge tone={result.preview.length > 0 ? 'positive' : 'neutral'}>
          {result.preview.length} ready to import
        </Badge>
        {result.skippedDuplicates > 0 ? (
          <Badge tone="neutral">{result.skippedDuplicates} duplicates will be skipped</Badge>
        ) : null}
        {result.errors.length > 0 ? (
          <Badge tone="negative">{result.errors.length} problem(s) to fix</Badge>
        ) : null}
      </div>
      {result.errors.length > 0 ? (
        <div className="rounded-[10px] border border-negative/30 bg-negative-soft/60 p-3">
          <p className="text-[13px] font-medium text-negative">
            Fix these lines and upload the file again — nothing has been imported.
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px]">
            {result.errors.map((e, i) => (
              <li key={`${e.line}-${i}`}>
                <span className="tabular font-medium">Line {e.line}:</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.preview.length > 0 ? (
        <div className="max-h-64 overflow-auto rounded-[10px] border">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-canvas text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.preview.slice(0, 200).map((r) => (
                <tr key={r.line}>
                  <td className="tabular px-3 py-1.5 text-muted">{r.line}</td>
                  <td className="tabular px-3 py-1.5 whitespace-nowrap">
                    {formatDate(r.occurredOn)}
                  </td>
                  <td className="px-3 py-1.5">{TRANSACTION_TYPE_LABEL[r.type]}</td>
                  <td className="max-w-[160px] truncate px-3 py-1.5">
                    {r.description || r.category || '—'}
                  </td>
                  <td className="px-3 py-1.5">{r.account}</td>
                  <td className="tabular px-3 py-1.5 text-right">{formatMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.preview.length > 200 ? (
            <p className="border-t px-3 py-2 text-[12px] text-muted">
              Showing the first 200 of {result.preview.length} rows.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Downloads the server CSV export for the given filters. */
export function useCsvExport() {
  const api = useApi();
  const today = useToday();
  return useMutation({
    mutationFn: (filters: TransactionFilters) => api.transactions.exportCsv(filters),
    onSuccess: (csv) => {
      downloadText(`moneymoney-transactions-${today}.csv`, csv);
      toast.success('Export ready', { description: 'Your CSV download has started.' });
    },
  });
}

export function ExportButton({ filters }: { filters: TransactionFilters }) {
  const exp = useCsvExport();
  return (
    <Button variant="outline" disabled={exp.isPending} onClick={() => exp.mutate(filters)}>
      <Icon name="download" size={16} />
      {exp.isPending ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}
