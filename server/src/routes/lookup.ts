import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

export const lookupRouter = Router();
lookupRouter.use(requireAuth);

// All areas with their plant, for the location dropdown
lookupRouter.get("/areas", async (_req, res) => {
  try {
    const areas = await prisma.area.findMany({
      include: { plant: { select: { id: true, name: true } } },
      orderBy: [{ plant: { name: "asc" } }, { name: "asc" }],
    });
    res.json(areas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

// Equipment in one area
lookupRouter.get("/equipment", async (req, res) => {
  try {
    const areaId = req.query.areaId as string | undefined;
    if (!areaId) return res.status(400).json({ message: "areaId is required" });
    const equipment = await prisma.equipment.findMany({
      where: { areaId },
      orderBy: { tag: "asc" },
    });
    res.json(equipment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});