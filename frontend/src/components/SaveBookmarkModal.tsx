import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from './ui/dialog';
import type { AppPredictionParams } from '../types';

interface SaveBookmarkModalProps {
  params: AppPredictionParams;
  stateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function SaveBookmarkModal({
  params,
  stateName,
  open,
  onOpenChange,
  onSaved,
}: SaveBookmarkModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.createBookmark({
        title: title.trim(),
        description: description.trim(),
        params: { ...params, state_name: stateName },
        is_public: isPublic,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent open={open}>
        <DialogClose className="absolute right-4 top-4 rounded-sm text-neutral-400 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-primary-400 focus-visible:outline-offset-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogTitle className="text-xl font-semibold text-white mb-1">Save Prediction</DialogTitle>
        <DialogDescription className="text-sm text-neutral-400 mb-4">
          Save your current prediction parameters as a bookmark
        </DialogDescription>

        {error && (
          <div className="mb-4 rounded-lg bg-error-muted/50 border border-error/30 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSave}>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Title *</label>
          <input
            type="text"
            className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400 mb-3"
            placeholder="e.g. Ruling party sweep with 75% turnout"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            autoFocus
          />

          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Description (optional)
          </label>
          <textarea
            className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400 mb-3 resize-none"
            placeholder="Describe your scenario..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />

          <label className="flex items-center gap-2 text-sm text-neutral-300 mb-4">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Publish publicly (others can view and react)
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary-400 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-primary-300 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Prediction'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
