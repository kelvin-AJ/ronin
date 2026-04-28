"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_json_1 = __importDefault(require("./swagger.json"));
dotenv_1.default.config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Swagger Documentation
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_json_1.default));
// Basic health check
app.get('/', (req, res) => {
    res.send('CyberRonin Backend: ACTIVE');
});
// Whitelist submission endpoint
app.post('/api/whitelist', async (req, res) => {
    const { twitter, wallet, referral } = req.body;
    if (!twitter || !wallet) {
        return res.status(400).json({ error: 'Twitter handle and Wallet address are required.' });
    }
    try {
        // Save to Neon DB using Prisma
        const newEntry = await prisma.whitelist.create({
            data: {
                twitter,
                wallet,
                referral: referral || null
            }
        });
        console.log('Successfully recorded in Undergrid:', newEntry);
        res.status(200).json({
            message: 'Success: CyberRonin Dossier recorded.',
            data: newEntry
        });
    }
    catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'This wallet is already synchronized with the rebellion.' });
        }
        console.error('Database Sync Error:', error);
        res.status(500).json({ error: 'PROTOCOL FAILURE: Unable to sync with Undergrid.' });
    }
});
// Get all whitelisted dossiers
app.get('/api/whitelist', async (req, res) => {
    try {
        const entries = await prisma.whitelist.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.status(200).json({
            data: entries
        });
    }
    catch (error) {
        console.error('Data Retrieval Error:', error);
        res.status(500).json({ error: 'PROTOCOL FAILURE: Unable to retrieve data from Undergrid.' });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
