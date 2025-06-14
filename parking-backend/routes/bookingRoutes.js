const express = require('express');
const router = express.Router();
const db = require('../db');
const formatDate = require('@utils/formatDate');
const { updateBookingStatus, getBookingStatus } = require('@services/bookingServices');
const { updateSlotStatus, getSlotId } = require('@services/slotServices');

let validStatusEnums;

async function getEnumValues(tableName, columnName) {
    const [rows] = await db.execute(
        `SHOW COLUMNS FROM ${tableName} WHERE FIELD = ?`,
        [columnName]
    );
    
    const enumString = rows[0].Type;
    return enumString
        .match(/enum\((.+)\)/i)[1]
        .split(',')
        .map(value => value.replace(/'/g, '').trim().toLowerCase());
}

async function initializeEnums() {
    try {
        validStatusEnums = await getEnumValues('bookings', 'status');
    } catch(err) {
        console.error('Error loading enums: ', err);
    }
}

initializeEnums();

// add a booking
router.post('/bookings', async (req, res) => { 
    const { user_id, vehicle_id, slot_id, fare } = req.body; 

    if (!user_id || !vehicle_id || !slot_id || !fare) {
        return res.status(400).json({ success: false, message: 'Missing required fields: user_id, vehicle_id, slot_id, and fare' });
    }

    try {
        await db.beginTransaction(); 

        const sql = `
            INSERT INTO bookings(user_id, vehicle_id, slot_id, fare)
            SELECT ?, ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1
                FROM bookings
                WHERE (user_id = ? AND vehicle_id = ?) OR slot_id = ?
            )
        `;
        const params = [user_id, vehicle_id, slot_id, fare, user_id, vehicle_id, slot_id];

        const [results] = await db.query(sql, params);

        if (results.affectedRows === 0) {
            await db.rollback(); // not strictly necessary here, but better to close the transaction with rollback or commit.
            return res.status(409).json({ success: false, message: "Duplicate entry: Vehicle already has a slot or slot is taken." });
        }

        const newBookingId = results.insertId;
        const slot_id = getSlotId(newBookingId);
        
        const slot_result = await updateSlotStatus(slot_id);
        
        if (!slot_result.success) {
            await db.rollback();
            return res.status(500).json({success: false, message: 'slot status update failure, transaction rolled back'});
        }

        await db.commit(); 

        return res.status(201).json({ success: true, message: "Booking successful", booking_id: newBookingId }); // 201 Created
    } catch (err) {
        await db.rollback();
        console.error('Error creating booking:', err);
        return res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
    }
});

// get bookings filtered by optional status
router.get('/bookings{/:status}', async (req, res) => {
    const { status } = req.params;

    try {
        let whereClause = "", params = [];
        if (status) {
            const statusList = status.split(',').map(s => s.trim().toLowerCase());

            const invalidStatus = statusList.find(s => !validStatusEnums.includes(s));
            if (invalidStatus) {
                return res.status(400).json({ error: `Invalid status: ${invalidStatus}`, validStatuses: validStatusEnums});
            }

            const placeholders = statusList.map(() => '?').join(',');
            whereClause = `WHERE status IN (${placeholders})`;
            params.push(...statusList);
        }

        const sql = `
            SELECT user_id, vehicle_id, slot_id, ${formatDate('booking_time', 'checkin_time', 'checkout_time')}, fare, status
            FROM bookings
            ${whereClause}
        `;

        const [results] = await db.query(sql, params);

        res.status(200).json(results);
    } catch (err) {
        console.error('Error fetching bookings:', err);
        return res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
    }
});

// update slot status and update checkin/checkout timing. 
router.patch('/bookings/:booking_id', async (req, res) => {
    const { booking_id } = req.params;

    if (!booking_id) {
        return res.status(400).json({ success: false, message: 'Booking ID is required to update timings.' });
    }

    try {
        await db.beginTransaction();

        const oldStatus = await getBookingStatus(booking_id);

        if (!oldStatus) {
            await db.rollback(); 
            return res.status(404).json({ success: false, message: 'No booking found with this ID.' });
        }

        // constants instead of string for comparisons
        const CANCELLED = 'cancelled';
        const COMPLETED = 'completed';
        const BOOKED = 'booked';
        const CHECKED_IN = 'checkedin';
        const OCCUPIED = 'occupied';
        const AVAILABLE = 'available';

        const lowerOldStatus = oldStatus.toLowerCase(); // Convert to lowercase for consistent comparison

        if (lowerOldStatus === CANCELLED || lowerOldStatus === COMPLETED) {
            await db.rollback();
            return res.status(400).json({ success: false, message: `Booking is already ${oldStatus}. Cannot update.` });
        }

        let checkMethod, newStatus, slotStatus;

        if (lowerOldStatus === BOOKED) {
            checkMethod = 'checkin_time';
            newStatus = CHECKED_IN;
            slotStatus = OCCUPIED;
        } else if (lowerOldStatus === CHECKED_IN) {
            checkMethod = 'checkout_time';
            newStatus = COMPLETED;
            slotStatus = AVAILABLE;
        } 

        await updateBookingStatus(booking_id, newStatus, checkMethod, 'CURRENT_TIMESTAMP');
        
        const slot_id = await getSlotId(booking_id);
        if (!slot_id) {
            await db.rollback();
            return res.status(404).json({ success: false, message: 'Could not find associated slot for booking.' });
        }

        await updateSlotStatus(slot_id, slotStatus);

        await db.commit();
        return res.status(200).json({ success: true, message: `Booking status updated to ${newStatus} and slot status updated to ${slotStatus}.` });

    } catch (err) { // service errors are also handled here.
        await db.rollback(); 
        console.error('Error updating booking/slot status:', err);
        if (err.message.includes('No rows affected')) {
            return res.status(400).json({ success: false, message: err.message });
        }
        return res.status(500).json({ success: false, message: 'An unexpected internal server error occurred.', error: err.message });
    }
});

module.exports = router;