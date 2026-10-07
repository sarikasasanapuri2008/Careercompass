import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerCompassRouter from "./career-compass";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerCompassRouter);

export default router;
