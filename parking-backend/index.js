const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Parking Backend Running!');
});

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const vehicleRouter = require('./routes/vehicleRoutes');
app.use('api/vehicles', vehicleRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));