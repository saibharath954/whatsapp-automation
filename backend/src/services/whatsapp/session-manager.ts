import { WhatsAppWebTransport } from './whatsapp-web.transport';
import { WhatsAppTransport, SessionStatus } from '../../types';
import { query, queryOne } from '../../db';
import { logger } from '../../utils/logger';

/**
 * WhatsApp Session Manager.
 * Manages per-org WhatsApp sessions with lifecycle management.
 */
export class SessionManager {
    private sessions: Map<string, WhatsAppTransport> = new Map();
    private qrCallbacks: Map<string, (qr: string) => void> = new Map();
    private statusCallbacks: Map<string, (status: SessionStatus) => void> = new Map();

    /**
     * Create and initialize a new WhatsApp session for an org.
     */
    async createSession(orgId: string): Promise<string> {
        // Check if session already exists
        if (this.sessions.has(orgId)) {
            logger.warn({ orgId }, 'Session already exists, destroying old one');
            await this.destroySession(orgId);
        }

        // Create DB record
        const existing = await queryOne<{ id: string }>(
            `SELECT id FROM whatsapp_sessions WHERE org_id = $1`,
            [orgId]
        );

        let sessionId: string;
        if (existing) {
            sessionId = existing.id;
            await query(
                `UPDATE whatsapp_sessions SET status = 'initializing', updated_at = NOW() WHERE id = $1`,
                [sessionId]
            );
        } else {
            const rows = await query<{ id: string }>(
                `INSERT INTO whatsapp_sessions (org_id, status) VALUES ($1, 'initializing') RETURNING id`,
                [orgId]
            );
            sessionId = rows[0].id;
        }

        // Create transport
        const transport = new WhatsAppWebTransport(orgId);

        // Wire up events
        transport.onQR((qr) => {
            this.qrCallbacks.get(orgId)?.(qr);
            query(
                `UPDATE whatsapp_sessions SET status = 'qr_pending', updated_at = NOW() WHERE org_id = $1`,
                [orgId]
            ).catch((err) => logger.error({ err }, 'Failed to update session status'));
        });

        transport.onReady(() => {
            this.statusCallbacks.get(orgId)?.('ready');
            query(
                `UPDATE whatsapp_sessions SET status = 'ready', last_active_at = NOW(), updated_at = NOW() WHERE org_id = $1`,
                [orgId]
            ).catch((err) => logger.error({ err }, 'Failed to update session status'));
        });

        transport.onDisconnected((reason) => {
            this.statusCallbacks.get(orgId)?.('disconnected');
            query(
                `UPDATE whatsapp_sessions SET status = 'disconnected', updated_at = NOW() WHERE org_id = $1`,
                [orgId]
            ).catch((err) => logger.error({ err }, 'Failed to update session status'));
            this.sessions.delete(orgId);
        });

        this.sessions.set(orgId, transport);

        // Initialize asynchronously
        transport.initialize().catch((err) => {
            logger.error({ err, orgId }, 'WhatsApp initialization failed');
            query(
                `UPDATE whatsapp_sessions SET status = 'error', updated_at = NOW() WHERE org_id = $1`,
                [orgId]
            ).catch(() => { });
        });

        return sessionId;
    }

    /**
     * Register a QR code callback for an org.
     */
    onQR(orgId: string, callback: (qr: string) => void): void {
        this.qrCallbacks.set(orgId, callback);
    }

    /**
     * Register a status change callback for an org.
     */
    onStatusChange(orgId: string, callback: (status: SessionStatus) => void): void {
        this.statusCallbacks.set(orgId, callback);
    }

    /**
     * Get the transport for an org.
     */
    getTransport(orgId: string): WhatsAppTransport | undefined {
        return this.sessions.get(orgId);
    }

    /**
     * Get session status.
     */
    getStatus(orgId: string): SessionStatus {
        const transport = this.sessions.get(orgId);
        return transport?.getStatus() || 'disconnected';
    }

    /**
     * Destroy a session.
     */
    async destroySession(orgId: string): Promise<void> {
        const transport = this.sessions.get(orgId);
        if (transport) {
            await transport.disconnect();
            this.sessions.delete(orgId);
        }
        this.qrCallbacks.delete(orgId);
        this.statusCallbacks.delete(orgId);

        await query(
            `UPDATE whatsapp_sessions SET status = 'disconnected', updated_at = NOW() WHERE org_id = $1`,
            [orgId]
        );
    }

    /**
     * Get all active sessions info.
     */
    getActiveSessions(): { orgId: string; status: SessionStatus }[] {
        return Array.from(this.sessions.entries()).map(([orgId, transport]) => ({
            orgId,
            status: transport.getStatus(),
        }));
    }
}
