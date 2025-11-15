import {v4 as uuidv4} from 'uuid';
import User from './models/User.js';
import Message from './models/Message.js';

export default  function setupSocket(io){
    io.on('connection',(socket)=>{
console.log('Connect', socket.id);

// client sends:{userName}
socket.on('auth:login',async(payload,cb)=>{
    try {
       if (!payload?.username) {
        return cb && cb({ok: false, error:'Username required'});
       }
       const username=payload.username;
       const user=await User.findOneAndUpdate(
        {username},
        {socketId:socket.id,isOnline:true},
        {upsert:true,new:true}
       );

    //    Join person room
    socket.join(`user:${user.username}`);

    //broadcast presence list (sample approach)
    const users=await User.find().select('username isOnline').lean();
    io.emit('presence:update',users);
    cb && cb({ok:true,user});
    } catch (error) {
console.error('Error', error);
cb&& cb({ok:false,error:'Server error'});
    }
});
socket.on('join:room',async({roomId},cb)=>{
    socket.join(roomId);
    cb&& cb({ok:true});
    io.to(roomId).emit('user:joined',{roomId,socketId:socket.id});
});
socket.on('leave:room',({roomId},cb)=>{
    socket.leave(roomId);
    cb && cb({ok:true});
    io.to(roomId).emit('user:left',{roomId, socketId:socket.id});

});

// Send message
socket.on('message:send',async(msgPayload, ack)=>{
    try {
        const message={
            roomId:msgPayload.roomId||'global',
            fromId:msgPayload.from,
            to:msgPayload.to||null,
            text:msgPayload.text||'',
            attachments:msgPayload.attachments||[],
            reactions:{},
            readBy:[],

        };
        const savedMessage=await Message.create(message);

        // emit to room
        io.to(savedMessage.roomId).emit('message:new', savedMessage);

        // if private (to specific user), also emit to their personal room;
        if(savedMessage.to){
            io.to(`user:${savedMessage.to}`).emit('message:new', savedMessage);
        }
        ack && ack({ok:true, id:savedMessage._id, createdAt:savedMessage.createdAt});
    } catch (error) {
console.error('Error', error);
ack && ack({ok:false, error:'Server error'});
    }
});
socket.on('message:read',async({messageId,user})=>{
    try {
        const message=await Message.findById(messageId);
        if(!message){
            return;

        }
        if(message.readBy.includes(user)){
            message.readBy.push(user);
            await message.save();
            io.to(message.roomId).emit('message:read', {messageId, user});
        }
    } catch (error) {
console.error('Error', error);

    }
});
socket.on('typing',({roomId,user,isTyping})=>{
    socket.to(roomId).emit('typing',{roomId,user,isTyping});

});

socket.on('reaction:add',async({roomId,messageId,emoji,user})=>{
    try {
       const message=await Message.findById(messageId);
       if(!message){
        return
       }
       const reactions=message.get(emoji)||[];
       if (!reactions.includes(user)) {
        reactions.push(user);
       }
       message.reactions.set(emoji,reactions);
       await message.save();
       io.to(roomId).emit('reaction:add', {roomId,reactions:Object.fromEntries(message.reactions)});
    } catch (error) {
console.error('Error', error);
    }
});
socket.on('disconnect',async()=>{
    try {
        // Find user by socketId and mark offline

        const user=await User.findOne({socketId:socket.id});
        if(user){
            user.isOnline=false;
            user.socketId=null;
            await user.save();

            const users=await User.find().select('username isOnline').lean();
            io.emit('presence:update', users);
            console.log('disconnected',socket.id);

        }
    } catch (error) {
console.error('Error', error);
    }
});
    });
}