import { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';

export async function wsRoutes(fastify: FastifyInstance) {
    // ─── WebSocket for QR code and live session updates ───
    fastify.get('/ws/session/:orgId', { websocket: true }, (socket, request) => {
        const orgId = (request.params as any).orgId;
        const { sessionManager } = fastify as any;

        if (!sessionManager) {
            socket.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
            socket.close();
            return;
        }

        // Register QR callback
        sessionManager.onQR(orgId, async (qr: string) => {
            try {
                const qrDataUrl = await QRCode.toDataURL(qr);
                socket.send(JSON.stringify({ type: 'qr', data: qrDataUrl }));
            } catch (err) {
                socket.send(JSON.stringify({ type: 'error', message: 'QR generation failed' }));
            }
        });

        // Register status callback
        sessionManager.onStatusChange(orgId, (status: string) => {
            socket.send(JSON.stringify({ type: 'status', data: status }));
        });

        // Handle incoming messages from client
        socket.on('message', async (data: any) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.type === 'connect') {
                    await sessionManager.createSession(orgId);
                    socket.send(JSON.stringify({ type: 'status', data: 'initializing' }));
                }

                if (msg.type === 'disconnect') {
                    await sessionManager.destroySession(orgId);
                    socket.send(JSON.stringify({ type: 'status', data: 'disconnected' }));
                }

                if (msg.type === 'status') {
                    const status = sessionManager.getStatus(orgId);
                    socket.send(JSON.stringify({ type: 'status', data: status }));
                }
            } catch (err) {
                socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
            }
        });

        socket.on('close', () => {
            // Clean up callbacks
        });
    });

    // ─── HTTP endpoint to trigger session connect ───
    fastify.post<{ Params: { orgId: string } }>(
        '/api/admin/sessions/:orgId/connect',
        async (request) => {
            const { sessionManager } = fastify as any;
            const sessionId = await sessionManager.createSession(request.params.orgId);
            return { sessionId, status: 'initializing' };
        }
    );

    // ─── HTTP endpoint to disconnect session ───
    fastify.delete<{ Params: { orgId: string } }>(
        '/api/admin/sessions/:orgId',
        async (request) => {
            const { sessionManager } = fastify as any;
            await sessionManager.destroySession(request.params.orgId);
            return { status: 'disconnected' };
        }
    );
}
