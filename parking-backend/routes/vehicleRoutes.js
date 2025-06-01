const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/register', (req, res) => {
    const {user_id, vehicle_number, vehicle_type} = req.body;
    if (!user_id || !vehicle_number || !vehicle_type) {
        return res.status(400).json({error: 'All field are required'});
    }
    const sql = `
    INSERT INTO vehicles (user_id, vehicle_number, vehicle_type)
    VALUES (?, ?, ?)
    `;

    db.query(sql, [user_id, vehicle_number, vehicle_type], (err, results) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({error: 'Vehicle already registered'});
            }
            return res.status(500).json({error: err.message});
        }
        res.status(201).json({message: 'Vehicle registered successfully', vehiclId: results.insertId});
    });
});

module.exports = router;