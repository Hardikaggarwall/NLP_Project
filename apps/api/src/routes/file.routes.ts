import {
    downloadFile,
    getUserFiles,
    processFile,
    uploadFile,
} from "@/controllers/file.controller";
import express, { Router } from "express";

const MAX_UPLOAD_SIZE = "25mb";

const router = Router();

router.post(
    "/upload",
    express.raw({ type: "application/pdf", limit: MAX_UPLOAD_SIZE }),
    uploadFile,
);
router.get("/download", downloadFile);
router.post("/process", processFile);
router.get("/", getUserFiles);

export default router;
