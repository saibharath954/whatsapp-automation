import { Client, LocalAuth, Message as WAMessage } from 'whatsapp-web.js';
import { WhatsAppTransport, InboundWhatsAppMessage, SessionStatus } from '../../types';
import { logger } from '../../utils/logger';

/**
 * WhatsApp Web.js transport implementation.
 *
 * Uses whatsapp-web.js for WhatsApp Web integration with per-org sessions.
 * This can be swapped for WhatsApp Cloud API by implementing the WhatsAppTransport interface.
 *
 * MIGRATION NOTE: To switch to Cloud API:
 *   1. Implement WhatsAppTransport with webhooks (POST /webhook) instead of puppeteer
 *   2. Use the WhatsApp Business API for sending messages
 *   3. Replace QR auth with Facebook Business verification flow
 *   See docs/cloud_api_migration.md for full migration guide.
 */

/**
 * Message sources that must be silently ignored.
 * These are non-customer messages that can cause VARCHAR overflow or unwanted bot replies.
 */
const IGNORED_SOURCES = ['@newsletter', '@g.us', 'status@broadcast'] as const;

export class WhatsAppWebTransport implements WhatsAppTransport {
    private client: Client;
    private status: SessionStatus = 'initializing';
    private orgId: string;
    private messageHandler?: (msg: InboundWhatsAppMessage) => Promise<void>;
    private qrHandler?: (qr: string) => void;
    private readyHandler?: (phone: string) => void;
    private disconnectedHandler?: (reason: string) => void;

    constructor(orgId: string) {
        this.orgId = orgId;
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: orgId }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                ],
            },
        });

        this.setupEventHandlers();
    }

    async initialize(): Promise<void> {
        const log = logger.child({ orgId: this.orgId, service: 'whatsapp' });
        log.info('Initializing WhatsApp client');
        this.status = 'initializing';

        try {
            await this.client.initialize();
        } catch (error) {
            log.error({ error }, 'Failed to initialize WhatsApp client');
            this.status = 'error';
            throw error;
        }
    }

    async sendMessage(to: string, text: string): Promise<void> {
        if (this.status !== 'ready') {
            throw new Error(`WhatsApp client not ready. Current status: ${this.status}`);
        }
        await this.client.sendMessage(to, text);
        logger.info({ orgId: this.orgId, to }, 'Sent WhatsApp message');
    }

    onMessage(handler: (msg: InboundWhatsAppMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    onQR(handler: (qr: string) => void): void {
        this.qrHandler = handler;
    }

    onReady(handler: (phone: string) => void): void {
        this.readyHandler = handler;
    }

    onDisconnected(handler: (reason: string) => void): void {
        this.disconnectedHandler = handler;
    }

    getStatus(): SessionStatus {
        return this.status;
    }

    async disconnect(): Promise<void> {
        try {
            await this.client.destroy();
            this.status = 'disconnected';
            logger.info({ orgId: this.orgId }, 'WhatsApp client disconnected');
        } catch (error) {
            logger.error({ error, orgId: this.orgId }, 'Error disconnecting WhatsApp client');
            this.status = 'error';
        }
    }

    private setupEventHandlers(): void {
        const log = logger.child({ orgId: this.orgId, service: 'whatsapp' });

        this.client.on('qr', (qr: string) => {
            this.status = 'qr_pending';
            log.info('QR code received');
            this.qrHandler?.(qr);
        });

        this.client.on('authenticated', () => {
            this.status = 'authenticated';
            log.info('WhatsApp authenticated');
        });

        this.client.on('ready', () => {
            this.status = 'ready';
            const phone = this.client.info?.wid?.user || 'unknown';
            log.info({ phone }, 'WhatsApp client ready');
            this.readyHandler?.(phone);
        });

        this.client.on('disconnected', (reason: string) => {
            this.status = 'disconnected';
            log.warn({ reason }, 'WhatsApp disconnected');
            this.disconnectedHandler?.(reason);
        });

        this.client.on('message', async (msg: WAMessage) => {
            // ── Filter out non-customer sources ──
            // Channels, Newsletters, Groups, and Status broadcasts are not customer
            // conversations and can cause VARCHAR overflow or unwanted bot triggers.
            if (IGNORED_SOURCES.some((source) => msg.from.includes(source))) {
                log.debug({ from: msg.from }, 'Ignoring non-customer message source');
                return;
            }

            // ── Guard: message handler must be registered ──
            if (!this.messageHandler) {
                log.error(
                    { messageId: msg.id._serialized, from: msg.from },
                    'CRITICAL: Inbound message received but no messageHandler is registered — message dropped!'
                );
                return;
            }

            try {
                const inbound: InboundWhatsAppMessage = {
                    id: msg.id._serialized,
                    from: msg.from,
                    body: msg.body,
                    timestamp: msg.timestamp,
                    hasMedia: msg.hasMedia,
                };

                // Handle media
                if (msg.hasMedia) {
                    try {
                        const media = await msg.downloadMedia();
                        if (media) {
                            inbound.mediaType = media.mimetype.split('/')[0];
                            inbound.mediaData = Buffer.from(media.data, 'base64');
                            inbound.mediaFilename = media.filename || undefined;
                            inbound.mediaMimeType = media.mimetype;
                        }
                    } catch (mediaErr) {
                        log.warn({ error: mediaErr, messageId: msg.id._serialized }, 'Failed to download media');
                    }
                }

                await this.messageHandler(inbound);
            } catch (error) {
                log.error({ error, messageId: msg.id._serialized }, 'Error processing inbound message');
            }
        });
    }
}
