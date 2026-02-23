import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    const cycle = () => {
        const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
        setTheme(next);
    };

    return (
        <button
            onClick={cycle}
            className="inline-flex items-center justify-center rounded-md p-2
                 text-muted-foreground hover:text-foreground hover:bg-accent
                 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            title={`Theme: ${theme}`}
            aria-label={`Current theme: ${theme}. Click to cycle.`}
        >
            {theme === 'light' && <Sun className="h-5 w-5" />}
            {theme === 'dark' && <Moon className="h-5 w-5" />}
            {theme === 'system' && <Monitor className="h-5 w-5" />}
        </button>
    );
}
