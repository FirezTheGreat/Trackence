import mongoose from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Build any missing schema indexes for every registered model (autoIndex is off).
 * createIndexes() never drops indexes and is a no-op for ones that already exist.
 */
export const ensureIndexes = async (): Promise<Array<{ model: string; error?: string }>> => {
    const results: Array<{ model: string; error?: string }> = [];
    for (const name of mongoose.modelNames()) {
        try {
            await mongoose.model(name).createIndexes();
            results.push({ model: name });
        } catch (error: any) {
            results.push({ model: name, error: error.message });
        }
    }
    return results;
};

export default class Mongoose {
    public async init(): Promise<void> {
        const mongoUrl = process.env.MONGODB_URI;

        if (!mongoUrl) {
            throw new Error('MONGODB_URI is not defined in the environment variables.');
        }

        try {
            await mongoose.connect(mongoUrl, {
                autoIndex: false,
                family: 4,
                connectTimeoutMS: 10000,
            });

            console.log('✅ Connected to MongoDB');
            logger.info('MongoDB connected');

            // Unique indexes back the duplicate-attendance / duplicate-email guarantees.
            // A failed build is loud but must not take the API down.
            for (const result of await ensureIndexes()) {
                if (result.error) {
                    logger.error('HEALTH_ALERT: MongoDB index build failed', result);
                }
            }

            mongoose.connection.on('connected', () => {
                console.log('MongoDB Connection Established!');
                logger.info('MongoDB connection established');
            });

            mongoose.connection.on('disconnected', () => {
                console.warn('MongoDB Connection Disconnected!');
                logger.error('HEALTH_ALERT: MongoDB disconnected');
            });

            mongoose.connection.on('reconnected', () => {
                console.log('MongoDB Connection Reestablished!');
                logger.warn('MongoDB reconnected after disconnect');
            });

            mongoose.connection.on('error', (error: Error) => {
                console.error(`MongoDB Connection Error:\n${error.message}`);
                logger.error('MongoDB connection error', { error: error.message });
            });
        } catch (error: any) {
            console.error(`Failed to connect to MongoDB:\n${error.message}`);
            process.exit(1);
        }
    }
}
