const db = require('../db');

async function getBookingStatus(booking_id) {
    const sql = `SELECT status FROM bookings WHERE id = ?`;
    const [rows] = await db.query(sql, [booking_id]);
    return rows.length ? rows[0].status : null;
}

async function updateBookingStatus(booking_id, status, checkMethod, checkMethodTiming) {
    let updateBookingSql;

    if (checkMethodTiming === 'CURRENT_TIMESTAMP') {
        updateBookingSql = `
            UPDATE bookings 
            SET ${checkMethod} = CURRENT_TIMESTAMP, status = ? 
            WHERE id = ?
        `;
    } else if (checkMethodTiming === 'NULL') {
        updateBookingSql = `
            UPDATE bookings 
            SET ${checkMethod} = NULL, status = ? 
            WHERE id = ?
        `;
    } else {
        throw new Error('Invalid checkMethodTiming provided for updateBookingStatus().');
    }

    const [bookingResult] = await db.query(updateBookingSql, [status, booking_id]);

    if (bookingResult.affectedRows === 0) {
        throw new Error(`Failed to update booking to ${status}. No rows affected.`);
    }
}


async function handleBookingExpiry() {
    const sql = `
        UPDATE bookings
        SET status = 'Cancelled'
        WHERE status = 'Booked' AND TIMESTAMPDIFF(MINUTE, booking_time, NOW()) > 15
    `;
    await db.query(sql);
}

module.exports = {
    updateBookingStatus,
    handleBookingExpiry,
    getBookingStatus,
};
