import { useState, useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FACTOR_CATALOG } from '../engine/factorConfig';
import type { AppPredictionParams } from '../types';

interface SurveyImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (params: Partial<AppPredictionParams>) => void;
}

interface ParsedRow {
  factor: string;
  value: number;
  valid: boolean;
  error?: string;
}

export default function SurveyImportModal({
  open,
  onOpenChange,
  onImport,
}: SurveyImportModalProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateRow = useCallback((factor: string, value: number): ParsedRow => {
    const catalog = FACTOR_CATALOG.find((f) => f.name === factor);
    if (!catalog) {
      return { factor, value, valid: false, error: `Unknown factor: ${factor}` };
    }
    if (value < catalog.range.min || value > catalog.range.max) {
      return {
        factor,
        value,
        valid: false,
        error: `Out of range [${catalog.range.min}, ${catalog.range.max}]`,
      };
    }
    return { factor, value, valid: true };
  }, []);

  const parseCSV = useCallback(
    (text: string) => {
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        setError('CSV must have a header row and at least one data row');
        return;
      }

      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const factorIdx = header.indexOf('factor');
      const valueIdx = header.indexOf('value');

      if (factorIdx === -1 || valueIdx === -1) {
        setError('CSV must have "factor" and "value" columns');
        return;
      }

      const rows: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols.length <= Math.max(factorIdx, valueIdx)) continue;
        const factor = cols[factorIdx];
        const value = parseFloat(cols[valueIdx]);
        if (!factor || isNaN(value)) continue;
        rows.push(validateRow(factor, value));
      }

      if (rows.length === 0) {
        setError('No valid rows found');
        return;
      }

      setError(null);
      setParsedRows(rows);
    },
    [validateRow]
  );

  const parseJSON = useCallback(
    (text: string) => {
      let data: Record<string, number>;
      try {
        data = JSON.parse(text);
      } catch {
        setError('Invalid JSON');
        return;
      }

      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        setError('JSON must be an object mapping factor names to values');
        return;
      }

      const rows: ParsedRow[] = Object.entries(data).map(([factor, value]) =>
        validateRow(factor, typeof value === 'number' ? value : NaN)
      );

      if (rows.length === 0) {
        setError('No valid entries found');
        return;
      }

      setError(null);
      setParsedRows(rows);
    },
    [validateRow]
  );

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 100 * 1024) {
        setError('File too large (max 100KB)');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result;
        if (typeof text !== 'string') return;

        if (file.name.endsWith('.json')) {
          parseJSON(text);
        } else {
          parseCSV(text);
        }
      };
      reader.readAsText(file);
    },
    [parseCSV, parseJSON]
  );

  const handleApply = useCallback(() => {
    const validRows = parsedRows.filter((r) => r.valid);
    if (validRows.length === 0) return;

    const params: Partial<AppPredictionParams> = {};
    validRows.forEach((r) => {
      (params as Record<string, number>)[r.factor] = r.value;
    });

    onImport(params);
    setParsedRows([]);
    setError(null);
    onOpenChange(false);
  }, [parsedRows, onImport, onOpenChange]);

  const handleClose = useCallback(() => {
    setParsedRows([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.filter((r) => !r.valid).length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-neutral-900 border border-neutral-800 rounded-xl p-6 w-[90vw] max-w-lg max-h-[80vh] overflow-y-auto z-50"
          onCloseAutoFocus={handleClose}
        >
          <Dialog.Title className="text-lg font-semibold text-primary-300 mb-2">
            Import Survey Data
          </Dialog.Title>
          <Dialog.Description className="text-sm text-neutral-400 mb-4">
            Upload a CSV or JSON file to populate factor sliders. CSV must have "factor" and "value"
            columns. JSON should map factor names to numeric values.
          </Dialog.Description>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFile}
            className="w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:text-neutral-300 file:cursor-pointer hover:file:bg-neutral-700 mb-4"
          />

          {error && (
            <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          {parsedRows.length > 0 && (
            <>
              <div className="text-xs text-neutral-400 mb-2">
                {validCount} valid, {invalidCount} invalid of {parsedRows.length} rows
              </div>
              <div className="max-h-48 overflow-y-auto border border-neutral-800 rounded-lg mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500">
                      <th className="px-3 py-2">Factor</th>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => (
                      <tr key={i} className="border-t border-neutral-800">
                        <td className="px-3 py-1.5 text-neutral-300 font-mono text-xs">
                          {row.factor}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-300 font-mono text-xs">
                          {row.value}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {row.valid ? (
                            <span className="text-success">✓</span>
                          ) : (
                            <span className="text-error" title={row.error}>
                              ✗ {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 justify-end">
                <Dialog.Close asChild>
                  <button className="rounded-lg border border-neutral-700 bg-transparent px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800 min-h-[44px]">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={handleApply}
                  disabled={validCount === 0}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  Apply {validCount} Factors
                </button>
              </div>
            </>
          )}

          {parsedRows.length === 0 && !error && (
            <div className="text-center py-6">
              <p className="text-sm text-neutral-500 mb-3">Example CSV format:</p>
              <pre className="text-xs text-neutral-400 bg-neutral-800 rounded-lg p-3 text-left inline-block">
                {`factor,value\nturnoutChange,5\nincumbencyFatigue,20\npartyStrengthFactor,-10`}
              </pre>
            </div>
          )}

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 text-neutral-500 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
