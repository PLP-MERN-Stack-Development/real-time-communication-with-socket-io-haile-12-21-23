import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';



const router=express.Router();

const uploadDir=process.env.UPLOAD_DIR||"uploads";
if(!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage=multer.diskStorage({
    destination:function (req,file,cb){
        cb(null, uploadDir);
    },
    filename:function (req,file,cb){
        const ext=path.extname(file.originalname);
        cb(null, Date.now()+'-'+ Math.round(Math.random()*1e19)+ext);
    }
});

const upload=multer({storage});

router.post('/',upload.single('file'),(req,res)=>{
    if(!req.file){
        return res.status(400).json({
            error:"No file uploaded"
        });
    }
    const url=`/uploads/${req.file.filename}`;
    res.status(200).json({ url, fileName:req.file.filename });
});

export default  router;