const express = require('express');
const router = express.Router();
const db = require('../db');

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

async function getBookingStatus(user_id, vehicle_id, slot_id) {
    try {
        const sql = `
            SELECT status
            FROM bookings
            WHERE user_id = ? AND vehicle_id = ? AND slot_id = ?
        `;
        const params = [user_id, vehicle_id, slot_id];

        const [results] = await db.query(sql, params);

        return results.length? results[0].status : null;
    } catch (err) {
        console.log("error getting booking status:", err)
    }
}

// update slot status to occupied and update checkin time. 
router.patch('/bookings/:user_id/:vehicle_id/:slot_id/checkin', async (req, res) => {
    const { user_id, vehicle_id, slot_id } = req.params;
    
    if (!user_id || !vehicle_id || !slot_id) 
        return res.status(400).json({message: 'need these fields user_id, vehicle_id and slot_id'});

    const bookingStatus = await getBookingStatus(user_id, vehicle_id, slot_id);
    
    if (!bookingStatus)
        return res.status(404).json({message: 'No matching booking found'});

    if (bookingStatus !== 'Booked')
        return res.status(400).json({message: `Booking status must be: 'Booked' not '${bookingStatus}'`});

    try {
        const sql = `
            UPDATE bookings
            SET checkin_time = CURRENT_TIMESTAMP, status = 'CheckedIn'
            WHERE user_id = ? AND vehicle_id = ? AND slot_id = ?
        `;
    
        const params = [user_id, vehicle_id, slot_id];

        const [results] = await db.query(sql, params);

        // also update the status of the slot to occupied if booking is updated
        if (results.affectedRows === 0) {
            return res.status(500).json({error: 'Booking checkin time update error'});
        } 
        else {
            try {
                const updateSlotStatus = `
                    UPDATE slots
                    SET status = 'Occupied'
                    WHERE id = ?
                `;
                const slotParams = [slot_id];

                const [slotResults] = await db.query(updateSlotStatus, slotParams);

                if (slotResults.affectedRows === 0) {
                    return res.status(404).json({message: `No slot found with this id: ${slot_id}`})
                }
                
                return res.status(200).json({message: 'slot status and checkin time updated successfully'});

            } catch (slotErr) {
                return res.status(500).json({error: slotErr.message, message: 'error in slot status update'});
            }
        }

    } catch (err) {
        return res.status(500).json({error: err.message, message: 'booking checkin time update error'});
    }
})


// update slot status to Available and update checkout time. 
router.patch('/bookings/:user_id/:vehicle_id/:slot_id/checkout', async (req, res) => {
    const { user_id, vehicle_id, slot_id } = req.params;
    
    if (!user_id || !vehicle_id || !slot_id) 
        return res.status(400).json({message: 'need these fields user_id, vehicle_id and slot_id'});

    const bookingStatus = await getBookingStatus(user_id, vehicle_id, slot_id);
    
    if (!bookingStatus)
        return res.status(404).json({message: 'No matching booking found'});

    if (bookingStatus !== 'CheckedIn')
        return res.status(400).json({message: `Booking status must be: 'CheckedIn' not '${bookingStatus}'`});

    try {
        const sql = `
            UPDATE bookings
            SET checkout_time = CURRENT_TIMESTAMP, status = 'Completed'
            WHERE user_id = ? AND vehicle_id = ? AND slot_id = ?
        `;
    
        const params = [user_id, vehicle_id, slot_id];

        const [results] = await db.query(sql, params);

        // also update the status of the slot to available if booking is updated
        if (results.affectedRows === 0)
            return res.status(500).json({message: 'error: Could not checkout'})
        else {
            try {
                const updateSlotStatus = `
                    UPDATE slots
                    SET status = 'Available'
                    WHERE id = ?
                `;
                const slotParams = [slot_id];

                const [slotResults] = await db.query(updateSlotStatus, slotParams);

                if (slotResults.affectedRows === 0) {
                    return res.status(404).json({message: `No slot found with this id: ${slot_id}`})
                }
                
                return res.status(200).json({message: 'slot status and checkout time updated successfully'});

            } catch (slotErr) {
                return res.status(500).json({error: slotErr.message, message: 'error in slot status update'});
            }
        }

    } catch (err) {
        return res.status(500).json({error: err.message, message: 'booking checkout time update error'});
    }
});

module.exports = router;