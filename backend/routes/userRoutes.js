const express = require('express');
const router = express.Router();
const db = require('../db');
const formatDate = require('@utils/formatDate');

router.get('/users', async (req, res) => {
    try {
        const sql = `
            SELECT id, username, ${formatDate('created_at')}
            FROM users
        `;
        
        const [results] = await db.query(sql);
        
        res.json(results);
    } 
    catch(err) {
        res.status(500).json({error: err.message});
    }
}); 

module.exports = router;