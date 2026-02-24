import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { Loader2, Lock, Mail, MessageSquare, AlertCircle } from 'lucide-react';

export default function Login() {
    const { login, isAuthenticated, isLoading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Already logged in → redirect to dashboard
    if (authLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (isAuthenticated) return <Navigate to="/" replace />;

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await login(email, password);
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,var(--color-primary)/15,transparent)]" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

            {/* Theme toggle */}
            <div className="absolute top-5 right-5 z-10">
                <ThemeToggle />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-[420px] px-4 animate-fade-in">
                {/* Logo / branding */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
                        <MessageSquare className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">WA Automation</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Sign in to your admin dashboard</p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-border bg-card shadow-xl shadow-black/5 dark:shadow-black/20">
                    <div className="p-6 sm:p-8">
                        {/* Error alert */}
                        {error && (
                            <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 animate-slide-up">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Email */}
                            <div>
                                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                                    <input
                                        id="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="admin@yourcompany.com"
                                        className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                                    <input
                                        id="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isSubmitting || !email || !password}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed press-effect"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-border px-6 py-4 sm:px-8">
                        <p className="text-center text-xs text-muted-foreground">
                            Secure authentication with encrypted tokens
                        </p>
                    </div>
                </div>

                {/* Dev hint */}
                <div className="mt-5 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
                    <p className="text-xs text-muted-foreground text-center">
                        <span className="font-medium">Dev credentials:</span>{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">admin@democorp.com</code>
                        {' / '}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">admin123</code>
                    </p>
                </div>
            </div>
        </div>
    );
}
