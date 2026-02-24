import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import {
    Upload,
    Loader2,
    BookOpen,
    CheckCircle2,
    AlertCircle,
    Circle,
    Trash2,
} from 'lucide-react';

interface KBDoc {
    id: string;
    title: string;
    source_url: string | null;
    file_type: string;
    status: string;
    chunk_count: number;
    created_at: string;
}

function DocStatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'ready': return <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3 w-3" /> Ready</span>;
        case 'processing': return <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning"><Loader2 className="h-3 w-3 animate-spin" /> Processing</span>;
        case 'error': return <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"><AlertCircle className="h-3 w-3" /> Error</span>;
        default: return <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"><Circle className="h-3 w-3" /> {status}</span>;
    }
}

export default function KnowledgeBase() {
    const { orgId } = useAuth();
    const [documents, setDocuments] = useState<KBDoc[]>([]);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [textContent, setTextContent] = useState('');

    useEffect(() => { if (orgId) fetchDocuments(); }, [orgId]);

    const fetchDocuments = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get<{ documents: KBDoc[] }>(`/api/kb/documents?orgId=${orgId}`);
            setDocuments(data.documents || []);
        } catch {
            setError('Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e: FormEvent) => {
        e.preventDefault();
        if (!title || !textContent || !orgId) return;
        setUploading(true);
        setError(null);
        try {
            await api.post('/api/kb/upload', { orgId, title, sourceUrl: sourceUrl || undefined, text: textContent, fileType: 'text' });
            setTitle(''); setSourceUrl(''); setTextContent(''); fetchDocuments();
        } catch {
            setError('Failed to upload document');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string) => {
        try {
            await api.delete(`/api/kb/documents/${docId}?orgId=${orgId}`);
            fetchDocuments();
        } catch {
            setError('Failed to delete document');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Knowledge Base</h2>
                <p className="text-sm text-muted-foreground mt-1">Upload and manage documents for RAG-powered responses</p>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* Upload form */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">Upload Document</h3>
                </div>
                <form onSubmit={handleUpload} className="p-5 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Document Title *</label>
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product FAQ" required
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Source URL (optional)</label>
                            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..."
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Content *</label>
                        <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Paste your document content here..." required rows={6}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
                    </div>
                    <button type="submit" disabled={uploading || !orgId}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 press-effect">
                        {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><Upload className="h-4 w-4" /> Upload &amp; Ingest</>}
                    </button>
                </form>
            </div>

            {/* Documents table */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">Documents ({documents.length})</h3>
                </div>
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Chunks</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                                <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
                                                <h3 className="text-sm font-semibold">No documents yet</h3>
                                                <p className="text-xs text-muted-foreground mt-1">Upload documents to enable knowledge-based responses</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    documents.map((doc) => (
                                        <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <span className="font-medium">{doc.title}</span>
                                                {doc.source_url && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{doc.source_url}</p>}
                                            </td>
                                            <td className="px-5 py-3.5"><span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{doc.file_type.toUpperCase()}</span></td>
                                            <td className="px-5 py-3.5 text-muted-foreground">{doc.chunk_count}</td>
                                            <td className="px-5 py-3.5"><DocStatusBadge status={doc.status} /></td>
                                            <td className="px-5 py-3.5 text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</td>
                                            <td className="px-5 py-3.5">
                                                <button onClick={() => handleDelete(doc.id)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-ring">
                                                    <Trash2 className="h-3 w-3" /> Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
