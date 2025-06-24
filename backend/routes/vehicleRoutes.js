const express = require('express');

express.use('/register', registerVehicles);
express.use('/update', updateVehiclesDetails);
express.use('/delete', deleteVehicle);
express.use('/list', listVehicles);

module.exports = router;
