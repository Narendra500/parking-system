const express = require('express');
const router = express.Router();
const db = require('../db');
const formatDate = require('@utils/formatDate');
const { updateBookingStatus } = require('@services/bookingService');

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

    const results = await updateBookingStatus(booking_id);

    return res.status(results.code).json({message: results.message});
})

module.exports = router;