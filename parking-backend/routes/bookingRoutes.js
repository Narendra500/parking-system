const express = require('express');
const router = express.Router();
const db = require('../db');
const formatDate = require('@utils/formatDate');

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

async function getSlotId(booking_id) {
    try {
        const sql = `
            SELECT slot_id
            FROM bookings
            WHERE id = ?
        `;

        const params = [booking_id];

        const results = await db.query(sql, params);
        return results[0][0].slot_id;
    } catch (err) {
        console.log("Error getting slot_id from booking id: ", err);
    }
}

async function getBookingStatus(booking_id) {
    try {
        const sql = `
            SELECT status
            FROM bookings
            WHERE id = ?
        `;
        const params = [booking_id];

        const [results] = await db.query(sql, params);

        return results.length? results[0].status : null;
    } catch (err) {
        console.log("error getting booking status:", err)
    }
}

router.put('/bookings/:user_id/:vehicle_id/:slot_id/:fare', async (req, res) => {
    const { user_id, vehicle_id, slot_id, fare } = req.params;
    
    if (!user_id || !vehicle_id || !slot_id || !fare) 
        return res.status(400).json({message: 'need these fields user_id, vehicle_id, slot_id and fare'});

    try {   
        // insert only if vehicle is not already granted a slot.
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
        if (results.affectedRows === 0) 
            return res.status(409).json({error: "duplicate entry ignored"});

        return res.status(200).json({message: "booking successful"});
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});

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

    const bookingStatus = await getBookingStatus(booking_id);

    // handle booking not found.
    if (!bookingStatus)
        return res.status(404).json({error: 'No matching booking found'});

    if (bookingStatus === 'Cancelled' || bookingStatus === 'Completed')
        return res.status(400).json({error: `Booking ${bookingStatus}`});

    let checkMethod, timingColumnToUpdate;
    if (bookingStatus === 'Booked') {
        timingColumnToUpdate = 'checkin_time';
        checkMethod = 'CheckedIn';
    } 
    else if (bookingStatus === 'CheckedIn') {
        timingColumnToUpdate = 'checkout_time';
        checkMethod = 'Completed'; 
    } 

    try {
        const sql = `
            UPDATE bookings
            SET ${timingColumnToUpdate} = CURRENT_TIMESTAMP, status = ?
            WHERE id = ?
        `;
    
        const params = [checkMethod, booking_id];

        const [results] = await db.query(sql, params);

        // also update the status of the slot to occupied if booking is updated
        if (results.affectedRows === 0) {
            return res.status(500).json({error: `Booking status: ${checkMethod} update error`});
        } 
        else {
            try {
                const slot_id = await getSlotId(booking_id);
                let slotStatus = checkMethod === 'CheckedIn'? 'Occupied' : 'Available';

                const updateSlotStatus = `
                    UPDATE slots
                    SET status = ?
                    WHERE id = ?
                `;
                const slotParams = [slotStatus, slot_id];

                const [slotResults] = await db.query(updateSlotStatus, slotParams);

                if (slotResults.affectedRows === 0) {
                    return res.status(404).json({message: `No slot found with this id: ${slot_id}`})
                }
                
                return res.status(200).json({message: 'slot status and booking status updated successfully'});

            } catch (slotErr) {
                return res.status(500).json({error: slotErr.message, message: 'error in slot status update'});
            }
        }

    } catch (err) {
        return res.status(500).json({error: err, message: 'booking status update error'});
    }
})

module.exports = router;