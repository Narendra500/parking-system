const express = require('express');
const router = express.Router();
const db = require('../db');
const formatDate = require('@utils/formatDate');

// register a vehicle for a user
router.post('/users/:user_id/vehicles', async (req, res) => {
    const {vehicle_number, vehicle_type} = req.body;
    const {user_id} = req.params;
    
    if (!vehicle_number || !vehicle_type) {
        return res.status(400).json({error: 'All field are required'});
    }

    try {
        const insertSql = `
            INSERT INTO vehicles (user_id, vehicle_number, vehicle_type)
            VALUES (?, ?, ?)
        `;
        await db.query(insertSql, [user_id, vehicle_number, vehicle_type]);
    
        return res.status(201).json({message: 'Vehicle registered successfully'});
    
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            try {
                const reactivateSql = `
                    UPDATE vehicles
                    SET is_deleted = 0
                    WHERE user_id = ? AND vehicle_number = ? AND is_deleted = 1
                `;
                const [updateResult] = await db.query(reactivateSql, [user_id, vehicle_number]);

                if (updateResult.affectedRows === 0) {
                    return res.status(409).json({error: 'Vehicle already registered and active'});
                }

                return res.status(201).json({message: 'Vehicle re-registered'});
            } catch (innerErr) {
                return res.status(500).json({error: innerErr.message});
            }
        }
        return res.status(500).json({error: err.message});
    }
});

// update vehicle details.
router.put('/users/:user_id/vehicles/:vehicle_id', async(req, res) => {
    const {user_id, vehicle_id} = req.params;
    const {vehicle_number, vehicle_type} = req.body;

    if (!vehicle_number || !vehicle_type) {
        return res.status(400).json({ error: 'Both vehicle_number and vehicle_type are required' });
    }

    try {
        const sql = `
            UPDATE vehicles
            SET vehicle_number = ?, vehicle_type = ?
            WHERE user_id = ? AND id = ? AND is_deleted = 0
        `;

        const [result] = await db.query(sql, [vehicle_number, vehicle_type, user_id, vehicle_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({error: 'Vehicle not found or no change made'});
        }

        return res.status(200).json({message: 'Vehicle details updated successfully'});
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});

// delete a particular vehicle of an user
router.delete('/users/:user_id/vehicles/:vehicle_number', async (req, res) => {
    const {user_id, vehicle_number} = req.params;
    try {
        const sql = `
            UPDATE vehicles
            SET is_deleted = 1
            WHERE user_id = ? AND vehicle_number = ? AND is_deleted = 0
        `;
        
        const [updateResult] = await db.query(sql, [user_id, vehicle_number]);

        if (updateResult.affectedRows === 0) {
            return res.status(404).json({error: 'Vehicle not found for this user'});
        }

        return res.status(200).json({message: 'Vehicle deleted successfully'});

    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});

// list vehicles of an user
router.get('/users/:user_id/vehicles', async (req, res) => {
    const {user_id} = req.params;

    try {
        const sql = `
            SELECT id, vehicle_number, vehicle_type, ${formatDate('registered_at')}
            FROM vehicles
            WHERE user_id = ? AND is_deleted = 0
            ORDER BY registered_at DESC
        `;

        const [results] = await db.query(sql, [user_id]);

        res.json(results);
    
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});

module.exports = router;