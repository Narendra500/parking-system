const db = require(../db);

// register a vehicle for a user
router.post('/vehicles', async (req, res) => {
    const { user_id, vehicle_number, vehicle_type} = req.body;
    
    if (!user_id || !vehicle_number || !vehicle_type) {
        return res.status(400).json({error: 'user_id, vehicle_number, vehicle_type required to register a vehicle'});
    }

    try {
        const insertSql = `
            INSERT INTO vehicles (user_id, vehicle_number, vehicle_type)
            VALUES (?, ?, ?)
        `;
        const [result] = await db.query(insertSql, [user_id, vehicle_number, vehicle_type]);
	if (result.affectRows === 0)
		return res.status(500).json(error: 'Could not register vehicle');
    
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
};
