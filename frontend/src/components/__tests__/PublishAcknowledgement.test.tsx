import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishConfirmDialog } from '../PublishAcknowledgement';

describe('PublishConfirmDialog', () => {
  it('only publishes after the simulation notice is ticked', () => {
    const onConfirm = vi.fn();
    render(
      <PublishConfirmDialog open title="My scenario" onCancel={() => {}} onConfirm={onConfirm} />
    );
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect((publish as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(publish);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
