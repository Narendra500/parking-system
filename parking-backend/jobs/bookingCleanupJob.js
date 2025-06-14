const cron = require('node-cron');
const { handleBookingExpiry } = require('@services/bookingServices');

// Run every 1 minute
cron.schedule('* * * * *', async () => {
    try {
        await handleBookingExpiry();
    } catch (err) {
        console.error('[CRON] Booking expiry failed:', err.message);
    }
});
