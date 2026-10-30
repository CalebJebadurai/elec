import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';

export const PUBLISH_ACK_TEXT =
  'I understand this is a simulation built from my own slider choices, not a forecast of the result. It will be shown publicly with a “Simulation, not a forecast” label, and I will not present it as a prediction or poll.';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Required tick-box before a scenario can be made public. */
export function PublishAckCheckbox({ checked, onChange }: CheckboxProps) {
  return (
    <label className="flex items-start gap-2 text-xs text-neutral-200 bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
      />
      <span>{PUBLISH_ACK_TEXT}</span>
    </label>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation step for publishing an already-saved scenario. */
export function PublishConfirmDialog({ open, title, onCancel, onConfirm }: DialogProps) {
  const [acked, setAcked] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setAcked(false);
          onCancel();
        }
      }}
    >
      <DialogContent open={open}>
        <DialogTitle>Publish “{title}”?</DialogTitle>
        <DialogDescription>Public scenarios appear in the community feed.</DialogDescription>
        <div className="mt-4">
          <PublishAckCheckbox checked={acked} onChange={setAcked} />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="bg-neutral-800 text-neutral-200 text-sm px-4 py-2 rounded-md border border-neutral-700 hover:bg-neutral-700 cursor-pointer min-h-[44px]"
              onClick={() => {
                setAcked(false);
                onCancel();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!acked}
              className="bg-primary-400 text-black font-semibold text-sm px-4 py-2 rounded-md hover:opacity-90 cursor-pointer min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => {
                setAcked(false);
                onConfirm();
              }}
            >
              Publish
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
