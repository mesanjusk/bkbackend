const User = require("./models/User");
const Role = require("./models/Role");

async function seedAdmin() {
  // 1. Ensure admin role exists
  let adminRole = await Role.findOne({ name: "admin" });

  if (!adminRole) {
    adminRole = await Role.create({
      name: "admin",
      code: "ADMIN"
    });
    console.log("✅ Admin role created");
  }

  // 2. Check if admin user exists
  const exists = await User.findOne({ username: "admin" });

  if (!exists) {
    await User.create({
      name: "Admin",
      username: "admin",
      password: "admin123",   // ✅ plain password (will auto-hash)
      roleId: adminRole._id,
    });

    console.log("✅ Admin user created");
  } else {
    console.log("ℹ️ Admin already exists");
  }
}

module.exports = seedAdmin;