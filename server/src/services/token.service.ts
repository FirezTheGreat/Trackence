import jwt from "jsonwebtoken";
import { PlatformRole, UserRole } from "../models/User.model";

const ACCESS_TOKEN_EXPIRES_IN = "1d";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

type TokenUser = {
  userId: string;
  role: UserRole;
  platformRole?: PlatformRole;
};

export const signToken = (user: TokenUser) => {
  return jwt.sign(
    { userId: user.userId, role: user.role, platformRole: user.platformRole || "user" },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
};

export const signRefreshToken = (user: TokenUser) => {
  return jwt.sign(
    { userId: user.userId, role: user.role, platformRole: user.platformRole || "user" },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

export const verifyRefreshToken = (refreshToken: string) => {
  return jwt.verify(
    refreshToken,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!
  ) as TokenUser;
};

export const decodeRefreshToken = (refreshToken: string): TokenUser => {
  return jwt.verify(
    refreshToken,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!
  ) as TokenUser;
};
