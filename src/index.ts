import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('--- SYSTEM STARTUP ---');
console.log('Target Port:', process.env.PORT || 5000);

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    max: 5,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

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
    } catch (error: any) {
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
    } catch (error) {
        console.error('Data Retrieval Error:', error);
        res.status(500).json({ error: 'PROTOCOL FAILURE: Unable to retrieve data from Undergrid.' });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

const shutdown = async () => {
    console.log('SIGTERM/SIGINT signal received: closing HTTP server');
    server.close(async () => {
        console.log('HTTP server closed');
        await prisma.$disconnect();
        await pool.end();
        console.log('Database connections closed');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
