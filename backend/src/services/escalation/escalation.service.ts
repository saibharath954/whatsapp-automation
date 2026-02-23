import { query, queryOne } from '../../db';
import { Escalation, EscalationStatus } from '../../types';
import { logger } from '../../utils/logger';
import { v4 as uuid } from 'uuid';

/**
 * Escalation Service.
 * Creates escalation tickets when confidence is low or retrieval fails.
 * Manages operator assignment and chat takeover.
 */
export class EscalationService {
    /**
     * Create an escalation ticket.
     */
    async createEscalation(params: {
        orgId: string;
        conversationId: string;
        customerId: string;
        reason: string;
    }): Promise<Escalation> {
        const id = uuid();
        const rows = await query<Escalation>(
            `INSERT INTO escalations (id, org_id, conversation_id, customer_id, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
            [id, params.orgId, params.conversationId, params.customerId, params.reason]
        );

        // Update conversation status
        await query(
            `UPDATE conversations SET status = 'escalated' WHERE id = $1`,
            [params.conversationId]
        );

        logger.info({
            escalationId: id,
            orgId: params.orgId,
            reason: params.reason,
        }, 'Escalation created');

        return rows[0];
    }

    /**
     * Get pending escalations for an org.
     */
    async getPendingEscalations(orgId: string): Promise<Escalation[]> {
        return query<Escalation>(
            `SELECT e.*, c.phone_number as customer_phone, c.name as customer_name
       FROM escalations e
       JOIN customers c ON e.customer_id = c.id
       WHERE e.org_id = $1 AND e.status IN ('pending', 'assigned', 'in_progress')
       ORDER BY e.created_at ASC`,
            [orgId]
        );
    }

    /**
     * Operator takes over a chat.
     */
    async takeover(escalationId: string, operatorName: string): Promise<Escalation | null> {
        const rows = await query<Escalation>(
            `UPDATE escalations
       SET status = 'in_progress', assigned_to = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [escalationId, operatorName]
        );

        if (rows[0]) {
            logger.info({ escalationId, operator: operatorName }, 'Operator took over escalation');
        }
        return rows[0] || null;
    }

    /**
     * Resolve an escalation.
     */
    async resolve(escalationId: string): Promise<Escalation | null> {
        const rows = await query<Escalation>(
            `UPDATE escalations
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [escalationId]
        );

        if (rows[0]) {
            // Update conversation status back to active
            await query(
                `UPDATE conversations SET status = 'active' WHERE id = $1`,
                [rows[0].conversation_id]
            );
            logger.info({ escalationId }, 'Escalation resolved');
        }
        return rows[0] || null;
    }

    /**
     * Get escalation by ID.
     */
    async getById(escalationId: string): Promise<Escalation | null> {
        return queryOne<Escalation>(
            `SELECT * FROM escalations WHERE id = $1`,
            [escalationId]
        );
    }

    /**
     * Get escalation stats for an org.
     */
    async getStats(orgId: string): Promise<{
        pending: number;
        in_progress: number;
        resolved_today: number;
    }> {
        const result = await query<{ status: EscalationStatus; count: string }>(
            `SELECT status, COUNT(*) as count
       FROM escalations
       WHERE org_id = $1 AND (status IN ('pending', 'in_progress') OR (status = 'resolved' AND resolved_at >= NOW() - INTERVAL '1 day'))
       GROUP BY status`,
            [orgId]
        );

        const stats = { pending: 0, in_progress: 0, resolved_today: 0 };
        for (const row of result) {
            if (row.status === 'pending') stats.pending = parseInt(row.count);
            if (row.status === 'in_progress') stats.in_progress = parseInt(row.count);
            if (row.status === 'resolved') stats.resolved_today = parseInt(row.count);
        }
        return stats;
    }
}
