const db = require('../db');

async function getSlotId(booking_id) {
    const sql = `SELECT slot_id FROM bookings WHERE id = ?`;
    const [rows] = await db.query(sql, [booking_id]);
    return rows.length ? rows[0].slot_id : null;
}

async function updateSlotStatus(slot_id, slot_status) {
    if (!slot_id || !slot_status) {
        throw new Error('Slot ID and status must be provided to update slot status.');
    }

    const updateSlotSql = `UPDATE slots SET status = ? WHERE id = ?`;
    const [slotResult] = await db.query(updateSlotSql, [slot_status, slot_id]);

    if (slotResult.affectedRows === 0) {
        throw new Error(`Failed to update slot status for slot ID ${slot_id}. No rows affected.`);
    }
}

module.exports = {
    updateSlotStatus,
    getSlotId,
};