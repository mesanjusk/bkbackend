const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donorGuestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  mode: { type: String, enum: ['cash','upi','cheque','promise'], default: 'cash' },
  note: { type: String, default: '' },
  receivedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  thankYouStatus: { type: String, enum: ['PENDING','SENT','FAILED'], default: 'PENDING' }
}, { timestamps: true });

module.exports = mongoose.model('Donation', donationSchema);
