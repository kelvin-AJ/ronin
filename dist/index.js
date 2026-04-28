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
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env') });
console.log('--- SYSTEM STARTUP ---');
console.log('Target Port:', process.env.PORT || 5000);
const app = (0, express_1.default)();
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    max: 5,
});
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
const PORT = process.env.PORT || 5000;
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "validator.swagger.io"],
        },
    },
}));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    optionsSuccessStatus: 200
};
app.use((0, cors_1.default)(corsOptions));
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
// Server-delivered whitelist view
app.get('/whitelist-view', async (req, res) => {
    const secret = req.query.secret;
    const envSecret = process.env.VIEW_SECRET_KEY;
    if (!envSecret) {
        return res.status(500).send('Server configuration error: VIEW_SECRET_KEY is not set.');
    }
    if (secret !== envSecret) {
        return res.send(`
            <html>
            <head>
                <title>Admin Login</title>
                <style>
                    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #111; color: #fff; margin: 0; }
                    .container { background: #222; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); width: 100%; max-width: 400px; }
                    input { padding: 0.75rem; margin-top: 0.5rem; border: 1px solid #444; border-radius: 4px; background: #333; color: white; width: 100%; box-sizing: border-box; }
                    button { margin-top: 1rem; padding: 0.75rem 1rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
                    button:hover { background: #45a049; }
                    h2 { margin-top: 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Admin Access</h2>
                    <form method="GET" action="/whitelist-view">
                        <label for="secret">Enter Secret Key:</label>
                        <input type="password" name="secret" id="secret" required />
                        <button type="submit">Login</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    }
    try {
        const entries = await prisma.whitelist.findMany({
            orderBy: { createdAt: 'desc' }
        });
        const rows = entries.map(e => `
            <tr>
                <td>${e.id}</td>
                <td>${e.twitter}</td>
                <td>${e.wallet}</td>
                <td>${e.referral || 'N/A'}</td>
                <td>${e.status}</td>
                <td>${new Date(e.createdAt).toLocaleString()}</td>
            </tr>
        `).join('');
        res.send(`
            <html>
            <head>
                <title>Whitelist View</title>
                <style>
                    body { font-family: sans-serif; background: #f4f4f9; padding: 2rem; color: #333; margin: 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
                    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #4caf50; color: white; }
                    tr:hover { background: #f1f1f1; }
                    h1 { color: #333; margin-top: 0; }
                    .header { display: flex; justify-content: space-between; align-items: center; }
                    .logout { color: #d32f2f; text-decoration: none; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>CyberRonin Whitelist</h1>
                    <a href="/whitelist-view" class="logout">Logout</a>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Twitter</th>
                            <th>Wallet</th>
                            <th>Referral</th>
                            <th>Status</th>
                            <th>Created At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </body>
            </html>
        `);
    }
    catch (error) {
        console.error('View Generation Error:', error);
        res.status(500).send('Error generating view.');
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
