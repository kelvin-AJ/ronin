import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    console.log('Testing connection to Undergrid...');
    console.log('URL:', process.env.DATABASE_URL);
    
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        const entries = await prisma.whitelist.findMany();
        console.log('Success! Found entries:', entries.length);
    } catch (error) {
        console.error('CRITICAL FAILURE IN UNDERGRID LINK:');
        console.error(error);
    } finally {
        await pool.end();
    }
}

main();
