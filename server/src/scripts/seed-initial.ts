/**
 * Bootstrap Script: Create Initial Organization and Platform Owner
 * 
 * This script creates:
 * 1. First organization (MITBLR-CSE)
 * 2. First platform_owner user
 * 
 * Run once during initial setup:
 * npx tsx src/scripts/seed-initial.ts
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

const INITIAL_ORG = {
    name: "MIT Bangalore - Computer Science", // change org name here
    code: "MITBLR-CSE", // change org here
    description: "Computer Science and Engineering Department, Manipal Institute of Technology, Bangalore" // change description here
};

// You can add multiple platform owners here
// Each will be assigned to the organization above
const INITIAL_PLATFORM_OWNERS = [
    {
        name: "Abhishek Ghosh", // Change this to your name
        email: "oyeabhi26@manipal.edu", // Change this to your email
    },
    // Uncomment and add more platform owners as needed:
    // {
    //     name: "Another Admin",
    //     email: "another-admin@manipal.edu",
    // },
];

async function seed() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined in environment variables");
        }

        await mongoose.connect(mongoUri);
        console.log("✓ Connected to MongoDB");

        // 1. Create initial platform owners first (needed for organization.owner and createdBy)
        const createdAdmins: any[] = [];
        
        for (const adminData of INITIAL_PLATFORM_OWNERS) {
            const existingUser = await User.findOne({ email: adminData.email });

            let user;
            if (existingUser) {
                // Update existing user
                existingUser.platformRole = "platform_owner";
                await existingUser.save();
                console.log("✓ Updated existing user:", adminData.email);
                user = existingUser;
            } else {
                user = await User.create({
                    userId: generateUserId(),
                    name: adminData.name,
                    email: adminData.email,
                    organizationIds: [],
                    requestedOrganizationIds: [],
                    userOrgRoles: [],
                    platformRole: "platform_owner",
                });
                console.log("✓ Created user:", adminData.email);
            }
            createdAdmins.push({ ...adminData, userId: user.userId, _id: user._id });
        }

        // 2. Create initial organization with first platform owner as owner
        const existingOrg = await Organization.findOne({ code: INITIAL_ORG.code });

        let organization;
        if (existingOrg) {
            console.log("✓ Organization already exists:", INITIAL_ORG.code);
            organization = existingOrg;
        } else {
            const firstAdmin = createdAdmins[0];
            organization = await Organization.create({
                organizationId: generateOrganizationId(),
                name: INITIAL_ORG.name,
                code: INITIAL_ORG.code,
                description: INITIAL_ORG.description,
                createdBy: firstAdmin.userId,
                owner: firstAdmin.userId,
                isActive: true,
                members: createdAdmins.map(admin => ({
                    userId: admin.userId,
                    name: admin.name,
                    email: admin.email,
                    role: "admin",
                    isOrgAdmin: true,
                })),
            });
            console.log("✓ Created organization:", INITIAL_ORG.code);
        }

        // 3. Update users with organization membership
        for (const admin of createdAdmins) {
            const user = await User.findById(admin._id);
            if (user) {
                if (!user.organizationIds.includes(organization.organizationId)) {
                    user.organizationIds.push(organization.organizationId);
                }
                // Add as admin of this org
                const existingRole = user.userOrgRoles?.find(
                    (r: any) => r.organizationId === organization.organizationId
                );
                if (!existingRole) {
                    (user.userOrgRoles || []).push({
                        organizationId: organization.organizationId,
                        role: "admin",
                    });
                }
                user.currentOrganizationId = organization.organizationId;
                await user.save();
                console.log("✓ Updated user org memberships:", admin.email);
            }
        }

        console.log("\n✅ Seed completed successfully!");
        console.log("\n📋 Summary:");
        console.log(`   Organization: ${organization.name} (${organization.code})`);
        console.log(`   Organization ID: ${organization.organizationId}`);
        console.log(`   Owner: ${createdAdmins[0]?.email || "N/A"}`);
        console.log(`   Platform Owners Created/Updated: ${createdAdmins.length}`);
        createdAdmins.forEach((admin, idx) => {
            console.log(`   ${idx + 1}. ${admin.email} (${admin.userId})`);
        });
        console.log("\n🔐 Next Steps:");
        console.log("   1. Login with any of the platform owner emails above");
        console.log("   2. Complete OTP verification");
        console.log("   3. Platform owners can manage their organization");
        console.log("   4. Approve user join requests and admin applications");
        console.log("\n⚠️  Security Notes:");
        console.log("   - Platform owners can only manage their own organization");
        console.log("   - To create more organizations, run this script with different org details");
        console.log("   - To add more platform owners to this org, add them to the INITIAL_PLATFORM_OWNERS array");

    } catch (error) {
        console.error("❌ Seed failed:", error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("\n✓ Disconnected from MongoDB");
        process.exit(0);
    }
}

seed();
