import {
    getAgreementDetails,
    getChatMessages,
    getUserAgreements,
    processAgreement,
    sendAgreementQuery,
} from "@/controllers/agreement.controller";
import { Router } from "express";

const router = Router();

router.get("/all", getUserAgreements);
router.get("/", getAgreementDetails);
router.get("/chat/messages", getChatMessages);
router.post("/process", processAgreement);
router.post("/query", sendAgreementQuery);

export default router;
