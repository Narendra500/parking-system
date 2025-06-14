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
        let whereClause = "WHERE 1", params = [];
        if (status) {
            const statusList = status.split(',').map(s => s.trim().toLowerCase());

            const invalidStatus = statusList.find(s => !validStatusEnums.includes(s));
            if (invalidStatus) {
                return res.status(400).json({ error: `Invalid status: ${invalidStatus}`, validStatuses: validStatusEnums});
            }

            const placeholders = statusList.map(() => '?').join(',');
            whereClause += ` AND status IN (${placeholders})`;
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
        return res.status(500).json({error: err.message});
    }
});

// update slot status and update checkin/checkout timing. 
router.patch('/bookings/:booking_id', async (req, res) => {
    const { booking_id} = req.params;
    
    if (!booking_id) 
        return res.status(400).json({message: 'need the booking_id to update CheckIn/ CheckOut timings'});

    const oldStatus = await getBookingStatus(booking_id);

    if (!oldStatus) 
        return res.status(404).json({ error: 'No booking found with this booking id' });

    if (oldStatus === 'Cancelled' || oldStatus === 'Completed') 
        return res.status(400).json({ error: `Booking is already ${oldStatus}` });
    

    const checkMethod = oldStatus === 'Booked' ? 'checkin_time' : 'checkout_time';
    const newStatus = oldStatus === 'Booked' ? 'CheckedIn' : 'Completed';
    const slotStatus = newStatus === 'CheckedIn' ? 'Occupied' : 'Available';
    let checkMethodTiming = 'CURRENT_TIMESTAMP';

    const bookingResult = await updateBookingStatus(booking_id, newStatus, checkMethod, checkMethodTiming);

    if (!bookingResult.success) 
        return res.status(bookingResult.code).json({ error: bookingResult.error, message: 'Booking status update failed' });
    
    
    // update slot status to reflect the new booking status
    const slot_id = await getSlotId(booking_id);
    const slotResult = await updateSlotStatus(slot_id, slotStatus);

    if (slotResult.success) {
        return res.status(200).json({ message: bookingResult.message + ', ' + slotResult.message });
    } else {
        // try to rollback the booking status update back to oldStatus.
        try {
         checkMethodTiming = 'NULL';

            await updateBookingStatus(booking_id, oldStatus, checkMethod, checkMethodTiming); 
            
            return res.status(500).json({ message: 'Slot status not updated and rollbacked the booking status update', slot_update_error: slotResult.error, slot_error_code: slotResult.code });
        
        } catch (err) {
            return res.status(500).json({ error: 'Slot status not updated and failed to rollback booking Status update', slot_update_error: slotResult.error, slot_error_code: slotResult.code });
        }
    }
})

module.exports = router;