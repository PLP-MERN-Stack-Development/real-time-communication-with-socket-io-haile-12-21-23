import express from 'express';
import Message from '../models/Message.js';

const router=express.Router();

// Get messages with pagination:?limit=25&before=<ISO timestamp>&roomId=global

router.get('/', async(req,res)=>{
    try {
        const limit=Math.min(parseInt(req.query.limit)||25,100);
        const roomId=req.query.roomId|| 'global';
        const before=req.query.before? new Date(req.query.before):new Date();
        const messages=await Message.find({roomId,createdAt:{$lt:before}})
        .sort({createdAt:-1})
        .limit(limit)
        .lean();

// return in chronological order
        res.json(messages.reverse());

    } catch (error) {
console.error(error);
res.status(500).json({ error: 'Internal server error' });
    }
});

export default router