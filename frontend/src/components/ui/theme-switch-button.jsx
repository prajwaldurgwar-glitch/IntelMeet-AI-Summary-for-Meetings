import React from 'react';
import { Moon, Sun } from 'lucide-react';
import './theme-switch-button.css';

export function ThemeSwitch({ className = '' }) {
  const [theme, setTheme] = React.useState('light');

  React.useEffect(() => {
    const savedTheme =
      localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    setTheme(savedTheme);
    const darkMode = savedTheme === 'dark';
    document.documentElement.classList.toggle('dark', darkMode);
    document.body.classList.toggle('dark-mode', darkMode);
    document.body.classList.toggle('light-mode', !darkMode);
  }, []);

  const toggleTheme = React.useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    const darkMode = newTheme === 'dark';

    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', darkMode);
    document.body.classList.toggle('dark-mode', darkMode);
    document.body.classList.toggle('light-mode', !darkMode);
  }, [theme]);

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggleTheme}
      className={`theme-switch-button ${className}`.trim()}
    >
      <Sun
        className={`theme-switch-icon ${
          theme === 'light' ? 'theme-switch-icon-visible' : 'theme-switch-icon-hidden'
        }`}
      />
      <Moon
        className={`theme-switch-icon ${
          theme === 'dark' ? 'theme-switch-icon-visible' : 'theme-switch-icon-hidden'
        }`}
      />
    </button>
  );
}
