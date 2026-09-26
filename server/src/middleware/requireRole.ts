import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";

export function requireRole(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Not logged in" });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: `Role ${req.user.role} is not allowed to do this` });
    }
    next();
  };
}