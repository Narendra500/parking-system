const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/slots{/:floor_number}', async (req, res) => {
    const { floor_number } = req.params;

    try {
        let sql, params;

        if (!floor_number) {
            sql = `
            SELECT slot_number, slot_type, floor_number, status
            FROM slots;
            `;
            params = [];
        } else {
            sql = `
            SELECT slot_number, slot_type, floor_number, status
            FROM slots
            WHERE floor_number = ?;
            `;
            params = [floor_number];
        }

        const [results] = await db.query(sql, params);

        if (results.length === 0) {
            return res.status(404).json({
            error: floor_number
                ? `No slots found on floor: ${floor_number} or floor doesn't exist`
                : "No slots found"
            });
        }

            return res.status(200).json(results);
    } catch (err) {
        return res.status(500).json({
        error: err.message,
        message: floor_number
        ? "Error while loading with floor_number"
        : "Error while loading without floor_number"
        });    
    }
});

module.exports = router;