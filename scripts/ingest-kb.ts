#!/usr/bin/env tsx
/**
 * KB Ingestion Script
 *
 * Usage:
 *   npx tsx scripts/ingest-kb.ts --org <org-id> --title "Doc Title" --file ./path/to/file.txt
 *   npx tsx scripts/ingest-kb.ts --org <org-id> --title "Doc Title" --url https://example.com --text "Content..."
 */

import * as fs from 'fs';

const API_BASE = process.env.API_URL || 'http://localhost:3000';

async function main() {
    const args = process.argv.slice(2);
    const orgId = getArg(args, '--org');
    const title = getArg(args, '--title');
    const filePath = getArg(args, '--file');
    const url = getArg(args, '--url');
    let text = getArg(args, '--text');

    if (!orgId || !title) {
        console.error('Usage: npx tsx scripts/ingest-kb.ts --org <org-id> --title "Title" [--file path | --text "content"]');
        process.exit(1);
    }

    // Read from file if specified
    if (filePath) {
        text = fs.readFileSync(filePath, 'utf-8');
        console.log(`Read ${text.length} characters from ${filePath}`);
    }

    if (!text) {
        console.error('Must provide --file or --text');
        process.exit(1);
    }

    console.log(`Ingesting "${title}" for org ${orgId}...`);
    console.log(`Content length: ${text.length} characters`);

    const res = await fetch(`${API_BASE}/api/kb/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orgId,
            title,
            sourceUrl: url || undefined,
            text,
            fileType: filePath?.endsWith('.pdf') ? 'pdf' : 'text',
        }),
    });

    if (res.ok) {
        const data = await res.json();
        console.log('✅ Document ingested successfully!');
        console.log(`   ID: ${data.document.id}`);
        console.log(`   Chunks: ${data.document.chunk_count || 'processing...'}`);
    } else {
        const err = await res.json();
        console.error('❌ Ingestion failed:', err);
        process.exit(1);
    }
}

function getArg(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
}

main().catch(console.error);
