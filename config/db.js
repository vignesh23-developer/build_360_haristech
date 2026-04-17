const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 
  "mongodb+srv://mdharixtechsolutions:Harix%40123@cluster0.qypnck4.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
.then(() => {
  console.log('✅ MongoDB connected successfully');
})
.catch((err) => {
  console.error('❌ MongoDB connection failed:', err.message);
});

module.exports = mongoose;

