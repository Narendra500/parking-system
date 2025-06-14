const db = require('../db');

async function getBookingStatus(booking_id) {
    const sql = `SELECT status FROM bookings WHERE id = ?`;
    const [rows] = await db.query(sql, [booking_id]);
    return rows.length ? rows[0].status : null;
}

async function updateBookingStatus(booking_id, status, checkMethod, checkMethodTiming) {
    try {
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
            return { success: false, code: 400, error: 'wrong checkMethodTiming given for updateBookingStatus()'};
        }     
            
        const [bookingResult] = await db.query(updateBookingSql, [status, booking_id]);

        if (bookingResult.affectedRows === 0) {
            return { success: false, code: 500, error: `Failed to update booking to ${status}` };
        }
        
        return {success: true, code: 200, message: `Updated booking status to ${status}`}

    } catch (err) {
        return { success: false, code: 500, error: err.message };
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
