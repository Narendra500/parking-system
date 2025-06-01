const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
    db.query("SELECT id, username, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM users", (err, results) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(results);
    });
});

module.exports = router;