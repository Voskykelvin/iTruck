import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<Modal isOpen={false} onClose={() => {}} title="Hidden" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an accessible dialog and closes with Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Confirm action">
        Modal content
      </Modal>
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Modal content');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
