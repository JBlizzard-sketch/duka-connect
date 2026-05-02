import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import productsRouter from "./products";
import customersRouter from "./customers";
import paymentsRouter from "./payments";
import analyticsRouter from "./analytics";
import webhooksRouter from "./webhooks";
import broadcastsRouter from "./broadcasts";
import staffRouter from "./staff";
import businessRouter from "./business";
import messagesRouter from "./messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(ordersRouter);
router.use(productsRouter);
router.use(customersRouter);
router.use(paymentsRouter);
router.use(analyticsRouter);
router.use(broadcastsRouter);
router.use(staffRouter);
router.use(businessRouter);
router.use(messagesRouter);

export default router;
