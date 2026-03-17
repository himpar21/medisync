const bcrypt = require("bcrypt");
const User = require("../models/User");
const tokenService = require("../services/tokenService");

const MALE_BLOCKS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T"];
const FEMALE_BLOCKS = ["A", "B", "C", "D", "E", "F", "G", "H", "RJT"];

const STUDENT_ROLES = new Set(["student", "patient"]);
const ROLE_ALIASES = {
  patient: "student",
};
const PASSWORD_RULES_MESSAGE =
  "Password must be at least 8 characters and include both letters and numbers";

function normalizeRole(role) {
  const normalized = String(role || "student").trim().toLowerCase();
  const aliased = ROLE_ALIASES[normalized] || normalized;
  if (["admin", "pharmacist", "student"].includes(aliased)) {
    return aliased;
  }
  return null;
}

function normalizeGender(gender) {
  const normalized = String(gender || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (["male", "female"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function formatUser(user) {
  const role = tokenService.normalizeRole(user.role);
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role,
    gender: user.gender || "",
    block: user.block || "",
    roomNo: user.roomNo || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getAllowedBlocks(gender) {
  if (gender === "male") return MALE_BLOCKS;
  if (gender === "female") return FEMALE_BLOCKS;
  return null;
}

function isStrongPassword(password) {
  const value = String(password || "");
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function validateStudentDetails({ gender, block, roomNo }) {
  const normalizedGender = normalizeGender(gender);
  const normalizedBlock = String(block || "").trim().toUpperCase();
  const normalizedRoomNo = String(roomNo || "").trim();

  if (!normalizedGender || !normalizedBlock || !normalizedRoomNo) {
    return {
      ok: false,
      message: "gender, block and roomNo are required for student accounts",
    };
  }

  const allowedBlocks = getAllowedBlocks(normalizedGender);
  if (!allowedBlocks) {
    return {
      ok: false,
      message: "Invalid gender. Allowed values: male, female",
    };
  }

  if (!allowedBlocks.includes(normalizedBlock)) {
    return {
      ok: false,
      message: `Invalid block for ${normalizedGender}. Allowed: ${allowedBlocks.join(", ")}`,
    };
  }

  return {
    ok: true,
    gender: normalizedGender,
    block: normalizedBlock,
    roomNo: normalizedRoomNo,
  };
}

exports.register = async (req, res) => {
  try {
    const role = normalizeRole(req.body.role);
    if (!role) {
      return res.status(400).json({
        message: "Invalid role. Allowed: pharmacist, student",
      });
    }

    if (role === "admin") {
      return res.status(403).json({
        message: "Admin account creation is not allowed from public registration",
      });
    }

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: PASSWORD_RULES_MESSAGE });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const userPayload = {
      name,
      email,
      password,
      role,
    };

    if (STUDENT_ROLES.has(role)) {
      const validation = validateStudentDetails(req.body);
      if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
      }
      userPayload.gender = validation.gender;
      userPayload.block = validation.block;
      userPayload.roomNo = validation.roomNo;
    }

    const user = await User.create(userPayload);
    return res.status(201).json({
      message: "User registered successfully",
      user: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const normalizedRole = tokenService.normalizeRole(user.role);
    const token = tokenService.signToken({
      userId: user._id,
      role: normalizedRole,
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  const user = await User.findById(req.user.userId).select("-password");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json({
    user: formatUser(user),
  });
};

exports.updateProfile = async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
    user.name = String(req.body.name || "").trim() || user.name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "password")) {
    const password = String(req.body.password || "");
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: PASSWORD_RULES_MESSAGE });
    }
    user.password = password;
  }

  if (STUDENT_ROLES.has(user.role)) {
    const nextGender = Object.prototype.hasOwnProperty.call(req.body, "gender")
      ? normalizeGender(req.body.gender)
      : user.gender;
    const nextBlock = Object.prototype.hasOwnProperty.call(req.body, "block")
      ? String(req.body.block || "").trim().toUpperCase()
      : user.block;
    const nextRoomNo = Object.prototype.hasOwnProperty.call(req.body, "roomNo")
      ? String(req.body.roomNo || "").trim()
      : user.roomNo;

    const validation = validateStudentDetails({
      gender: nextGender,
      block: nextBlock,
      roomNo: nextRoomNo,
    });
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    user.gender = validation.gender;
    user.block = validation.block;
    user.roomNo = validation.roomNo;
  }

  await user.save();
  return res.status(200).json({
    message: "Profile updated successfully",
    user: formatUser(user),
  });
};

exports.listUsers = async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 }).select("-password").limit(200);
  return res.status(200).json({
    items: users.map(formatUser),
  });
};
