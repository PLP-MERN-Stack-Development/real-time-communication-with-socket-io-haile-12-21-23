import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({

    username: { type: String, required: true, unique: true },
    socketId: { type: String, default: null, },
    isOnline: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);
