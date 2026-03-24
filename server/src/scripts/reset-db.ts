/**
 * Database Reset & Setup Script
 * 
 * 1. Deletes all data
 * 2. Creates 2 organizations (CSE, ECE)
 * 3. Creates platform_owner user for CSE
 * 4. Adds user as member in ECE
 * 
 * Run: npx tsx src/scripts/reset-db.ts
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import Organization from "../models/Organization.model";
import User from "../models/User.model";
import { generateOrganizationId, generateUserId } from "../utils/id.utils";

dotenv.config({
    path: path.resolve(
        process.cwd(),
        process.env.NODE_ENV === "production"
            ? ".env.production"
            : ".env.development"
    ),
});

const ADMIN_EMAIL = "oyeabhi26@manipal.edu";
const ADMIN_NAME = "Abhishek Ghosh";

async function resetDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined");
        }

        await mongoose.connect(mongoUri);
        console.log("✓ Connected to MongoDB");

        // 1. Drop all collections
        console.log("\n🗑️  Clearing database...");
        const collections = await mongoose.connection.db?.listCollections().toArray();
        for (const collection of collections || []) {
            await mongoose.connection.collection(collection.name).deleteMany({});
            console.log(`   ✓ Cleared ${collection.name}`);
        }

        // 2. Create platform owner user
        console.log("\n👤 Creating platform owner user...");
        const adminUserId = generateUserId();
        const adminUser = await User.create({
            userId: adminUserId,
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            organizationIds: [],
            requestedOrganizationIds: [],
            userOrgRoles: [], // Will be populated after orgs are created
            platformRole: "platform_owner",
        });
        console.log(`   ✓ Created: ${ADMIN_NAME} (${ADMIN_EMAIL})`);
        console.log(`   ✓ User ID: ${adminUserId}`);

        // 3. Create CSE organization (user is platform owner/owner)
        console.log("\n🏢 Creating CSE Organization...");
        const cseOrgId = generateOrganizationId();
        const cseOrg = await Organization.create({
            organizationId: cseOrgId,
            name: "MIT Bangalore - Computer Science (CSE)",
            code: "MITBLR-CSE",
            description: "Computer Science and Engineering Department",
            createdBy: adminUserId,
            owner: adminUserId,
            isActive: true,
            members: [
                {
                    userId: adminUserId,
                    name: ADMIN_NAME,
                    email: ADMIN_EMAIL,
                    role: "member",
                    isOrgAdmin: true,
                },
            ],
        });
        console.log(`   ✓ Organization: ${cseOrg.name}`);
        console.log(`   ✓ Org ID: ${cseOrgId}`);
        console.log(`   ✓ Code: ${cseOrg.code}`);

        // 4. Create ECE organization (user is member only)
        console.log("\n🏢 Creating ECE Organization...");
        const eceOrgId = generateOrganizationId();
        const eceOrgOwner = adminUserId; // Same user, but as member member only
        const eceOrg = await Organization.create({
            organizationId: eceOrgId,
            name: "MIT Bangalore - Electrical & Communication Engineering (ECE)",
            code: "MITBLR-ECE",
            description: "Electrical and Communication Engineering Department",
            createdBy: eceOrgOwner,
            owner: eceOrgOwner,
            isActive: true,
            members: [
                {
                    userId: adminUserId,
                    name: ADMIN_NAME,
                    email: ADMIN_EMAIL,
                    role: "member",
                    isOrgAdmin: false, // Member only
                },
            ],
        });
        console.log(`   ✓ Organization: ${eceOrg.name}`);
        console.log(`   ✓ Org ID: ${eceOrgId}`);
        console.log(`   ✓ Code: ${eceOrg.code}`);

        // 5. Update user with org memberships
        console.log("\n🔗 Setting up user memberships...");
        adminUser.organizationIds = [cseOrgId, eceOrgId];
        (adminUser.userOrgRoles as any[]).push(
            { organizationId: cseOrgId, role: "admin" },  // Admin in CSE
            { organizationId: eceOrgId, role: "member" } // Member in ECE
        );
        adminUser.currentOrganizationId = cseOrgId;
        await adminUser.save();
        console.log(`   ✓ Added to CSE (as Admin)`);
        console.log(`   ✓ Added to ECE (as Member)`);

        // 6. Display summary
        console.log("\n" + "=".repeat(60));
        console.log("✅ DATABASE RESET COMPLETE");
        console.log("=".repeat(60));
        console.log("\n📋 Setup Summary:");
        console.log(`\n👤 User:`);
        console.log(`   Email: ${ADMIN_EMAIL}`);
        console.log(`   Name: ${ADMIN_NAME}`);
        console.log(`   User ID: ${adminUserId}`);
        console.log(`\n🏢 CSE Organization:`);
        console.log(`   Name: ${cseOrg.name}`);
        console.log(`   Code: ${cseOrg.code}`);
        console.log(`   ID: ${cseOrgId}`);
        console.log(`   Your Role: Admin ⭐`);
        console.log(`\n🏢 ECE Organization:`);
        console.log(`   Name: ${eceOrg.name}`);
        console.log(`   Code: ${eceOrg.code}`);
        console.log(`   ID: ${eceOrgId}`);
        console.log(`   Your Role: Member`);
        console.log("\n🔐 Next Steps:");
        console.log(`   1. Go to http://localhost:5173`);
        console.log(`   2. Sign up or login with: ${ADMIN_EMAIL}`);
        console.log(`   3. You'll receive an OTP in terminal (or email)`);
        console.log(`   4. CSE: You can manage members, create sessions`);
        console.log(`   5. ECE: You can only mark attendance, view data`);
        console.log("\n" + "=".repeat(60) + "\n");

    } catch (error) {
        console.error("❌ Reset failed:", error instanceof Error ? error.message : error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("✓ Disconnected from MongoDB\n");
        process.exit(0);
    }
}

resetDatabase();
