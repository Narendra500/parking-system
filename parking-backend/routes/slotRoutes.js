const express = require('express');
const router = express.Router();
const db = require('../db');

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
        validStatusEnums = await getEnumValues('slots', 'status');
    } catch(err) {
        console.error('Error loading enums: ', err);
    }
}

initializeEnums();

router.get('/slots{/:floor_number}', async (req, res) => {
    const { floor_number } = req.params;
    const { status } = req.query;
    
    try {
        let sql, params = [], whereClause = "WHERE 1";

        if (floor_number) {
            const floor = Number(floor_number);
            if (Number.isNaN(floor) || !Number.isInteger(floor)) {
                return res.status(400).json({ error: 'Invalid floor number' });
            }

            whereClause += " AND floor_number = ?";
            params.push(floor);
        } 
        if (status) {
            const statusList = status.split(',').map(s => s.trim().toLowerCase());

            const invalidStatus = statusList.find(s => !validStatusEnums.includes(s));
            if (invalidStatus) {
                return res.status(400).json({ error: `Invalid status: ${invalidStatus}` });
            }

            const placeholders = statusList.map(() => '?').join(',');
            whereClause += ` AND status IN (${placeholders})`;
            params.push(...statusList);
        }

         
        sql = `
            SELECT floor_number, slot_number, slot_type, status
            FROM slots
            ${whereClause}
            ORDER BY floor_number, slot_number
        `;

        // pagination
        const limit = parseInt(req.query.limit, 10) || 100; // default max 100
        const offset = parseInt(req.query.offset, 10) || 0;

        if (limit < 1 || offset < 0) {
        return res.status(400).json({ error: 'Invalid limit or offset' });
        }

        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);
    
        const [results] = await db.query(sql, params);

        if (results.length === 0) {
            return res.status(404).json({
            error: floor_number
                ? `No slots found on floor: ${floor_number} or floor doesn't exist`
                : "No slots found"
            });
        }

        // grouping the results by floor_number
        const grouped = {};

        for (const row of results) {
            const key = row.floor_number; 
            if (!grouped[key]) grouped[key] = [];
            delete row.floor_number; // already grouping by floor_number so don't need to display it individually.
            grouped[key].push(row);
        }

        return res.status(200).json(grouped);
    } catch (err) {
        return res.status(500).json({
            error: err.message,
            message: floor_number? "Error while loading with floor_number" : "Error while loading without floor_number"
        });    
    }
});

module.exports = router;