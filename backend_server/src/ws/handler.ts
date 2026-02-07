import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { RunManager } from './runManager';

export const handleConnection = (socket: WebSocket, req: FastifyRequest): void => {
    console.log('New WebSocket connection');

    // Each connection gets its own RunManager
    new RunManager(socket);
};
