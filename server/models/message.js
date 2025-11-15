import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    roomId: { type: String, default: 'global' },
    from:{
        id:{type:String},
        name:{type:String}
    },
    to: { type: String, default: null },
    text: { type: String, default: '' },
    attachments: [{ url: String, filename: String, mime: String, size: Number }],
    reactions: { type: Map, of: [String], default: {} },
    readBy: [{ type: String }],
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Message', messageSchema);