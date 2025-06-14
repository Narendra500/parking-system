const db = require('../db');

async function getSlotId(booking_id) {
    const sql = `SELECT slot_id FROM bookings WHERE id = ?`;
    const [rows] = await db.query(sql, [booking_id]);
    return rows.length ? rows[0].slot_id : null;
}

async function updateSlotStatus(slot_id, slot_status) {
    if (!slot_id || !slot_status) {
        return { success: false, code: 404, message: `Slot ID/Status not given given.` };
    }

    try {
        const updateSlotSql = `
            UPDATE slots
            SET status = ?
            WHERE id = ?
        `;
        const [slotResult] = await db.query(updateSlotSql, [slot_status, slot_id]);

        if (slotResult.affectedRows === 0) {
            return { success: false, code: 400, error: `Failed to update slot status` };
        }

        return { success: true, code: 200, message: `Slot status updated to ${slot_status}` };

    } catch (err) {
        return {success: false, code: 500, error: `Error in updating slot status, ${err}`};
    }
}

module.exports = {
    updateSlotStatus,
    getSlotId,
};