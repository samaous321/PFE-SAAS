import jwt from "jsonwebtoken";

const normalizeJwtUser = (user) => ({
  ...user,
  _id: user?._id || user?.userId || user?.id || null,
  id: user?.id || user?.userId || user?._id || null,
  userId: user?.userId || user?.id || user?._id || null,
  tenantId: user?.tenantId || user?.tenant || user?.tenant_id || null,
  role: user?.role || null
});

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }

    req.user = normalizeJwtUser(user);
    next();
  });
};

export const authenticateTokenOptional = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (!err && user) {
      req.user = normalizeJwtUser(user);
    }

    next();
  });
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
};

// import jwt from "jsonwebtoken";
// import User from "../models/User.js";

// export const authenticateToken = async (req, res, next) => {

//   try {

//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return res.status(401).json({ error: "No token provided" });
//     }

//     const token = authHeader.split(" ")[1];

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     const user = await User.findById(decoded.id)
//       .select("+password");

//     if (!user) {
//       return res.status(401).json({ error: "User not found" });
//     }

//     if (user.status !== "active") {
//       return res.status(403).json({ error: "User blocked" });
//     }

//     req.user = {
//       _id: user._id,
//       tenantId: user.tenantId,
//       role: user.role
//     };

//     next();

//   } catch (err) {
//     return res.status(403).json({ error: "Invalid token" });
//   }
// };