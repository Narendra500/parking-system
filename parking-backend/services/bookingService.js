const db = require('../db');

async function getBookingStatus(booking_id) {
    const sql = `SELECT status FROM bookings WHERE id = ?`;
    const [rows] = await db.query(sql, [booking_id]);
    return rows.length ? rows[0].status : null;
}

async function getSlotId(booking_id) {
    const sql = `SELECT slot_id FROM bookings WHERE id = ?`;
    const [rows] = await db.query(sql, [booking_id]);
    return rows.length ? rows[0].slot_id : null;
}

async function updateBookingStatus(booking_id) {
    const currentStatus = await getBookingStatus(booking_id);

    if (!currentStatus) {
        return { success: false, code: 404, message: 'No matching booking found' };
    }

    if (currentStatus === 'Cancelled' || currentStatus === 'Completed') {
        return { success: false, code: 400, message: `Booking is already ${currentStatus}` };
    }

    const timingColumn = currentStatus === 'Booked' ? 'checkin_time' : 'checkout_time';
    const nextStatus = currentStatus === 'Booked' ? 'CheckedIn' : 'Completed';
    const slotStatus = nextStatus === 'CheckedIn' ? 'Occupied' : 'Available';

    try {
        const updateBookingSql = `
            UPDATE bookings
            SET ${timingColumn} = CURRENT_TIMESTAMP, status = ?
            WHERE id = ?
        `;
        const [bookingResult] = await db.query(updateBookingSql, [nextStatus, booking_id]);

        if (bookingResult.affectedRows === 0) {
            return { success: false, code: 500, message: `Failed to update booking to ${nextStatus}` };
        }

        const slot_id = await getSlotId(booking_id);
        if (!slot_id) {
            return { success: false, code: 404, message: `Slot ID not found for booking` };
        }

        const updateSlotSql = `
            UPDATE slots
            SET status = ?
            WHERE id = ?
        `;
        const [slotResult] = await db.query(updateSlotSql, [slotStatus, slot_id]);

        if (slotResult.affectedRows === 0) {
            return { success: false, code: 404, message: `Failed to update slot status` };
        }

        return { success: true, code: 200, message: `Booking and slot updated to ${nextStatus}` };

    } catch (err) {
        return { success: false, code: 500, message: err.message };
    }
}

module.exports = {
    updateBookingStatus,
};
