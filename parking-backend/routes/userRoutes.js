const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/users', async (req, res) => {
    try {
        const sql = `
            SELECT id, username, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at 
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