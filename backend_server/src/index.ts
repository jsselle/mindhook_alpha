import { createServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const start = async () => {
    const server = await createServer();

    try {
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Server running on port ${PORT}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
