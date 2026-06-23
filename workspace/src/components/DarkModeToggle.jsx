import React from 'react';
import { Moon, Sun } from 'lucide-react';

export default function DarkModeToggle({ dark, onToggle }) {
  return (
    <button
      className="dark-toggle"
      type="button"
      onClick={onToggle}
      aria-label="Toggle dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
