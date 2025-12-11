/**
 * Inference Client - Bridge between TypeScript and Python ML model
 * Spawns Python process, sends features via stdin, receives predictions via stdout
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { FeatureBuilder, TokenData } from './featureBuilder';

interface PredictionResult {
    profitable: number;       // 0-1 probability
    max_profit: number;       // Expected max profit %
    rug_risk: number;         // 0-1 probability
    confidence: number;       // 0-1 overall confidence
    error?: string;
}

export class InferenceClient {
    private pythonProcess: ChildProcess | null = null;
    private featureBuilder: FeatureBuilder;
    private isReady: boolean = false;
    private pendingRequests: Map<number, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }> = new Map();
    private requestId: number = 0;
    private buffer: string = '';
    private restartCount: number = 0;
    private maxRestarts: number = 5;
    private pythonPath: string;
    private scriptPath: string;
    
    constructor() {
        this.featureBuilder = new FeatureBuilder();
        
        // Detect Python path (assumes .venv in project root)
        const isWindows = process.platform === 'win32';
        const venvPath = path.join(__dirname, '..', '..', '.venv');
        
        if (isWindows) {
            this.pythonPath = path.join(venvPath, 'Scripts', 'python.exe');
        } else {
            this.pythonPath = path.join(venvPath, 'bin', 'python');
        }
        
        this.scriptPath = path.join(__dirname, 'inference.py');
    }
    
    /**
     * Start the Python inference process
     */
    async start(): Promise<void> {
        if (this.pythonProcess) {
            console.log('⚠️ Inference process already running');
            return;
        }
        
        console.log('🚀 Starting ML inference server...');
        
        try {
            this.pythonProcess = spawn(this.pythonPath, [this.scriptPath], {
                cwd: path.join(__dirname),
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });
            
            // Handle stdout (predictions)
            this.pythonProcess.stdout?.on('data', (data: Buffer) => {
                this.handleStdout(data.toString());
            });
            
            // Handle stderr (logs)
            this.pythonProcess.stderr?.on('data', (data: Buffer) => {
                const message = data.toString().trim();
                if (message.includes('ready') || message.includes('Listening')) {
                    this.isReady = true;
                    console.log('✅ ML inference server ready');
                } else if (message.includes('ERROR') || message.includes('Error')) {
                    console.error(`🔴 Python: ${message}`);
                } else {
                    console.log(`🐍 Python: ${message}`);
                }
            });
            
            // Handle process exit
            this.pythonProcess.on('exit', (code, signal) => {
                console.error(`❌ Python process exited (code: ${code}, signal: ${signal})`);
                this.isReady = false;
                this.pythonProcess = null;
                
                // Reject all pending requests
                for (const [id, req] of this.pendingRequests.entries()) {
                    clearTimeout(req.timeout);
                    req.reject(new Error('Python process died'));
                    this.pendingRequests.delete(id);
                }
                
                // Auto-restart (watchdog)
                if (this.restartCount < this.maxRestarts) {
                    this.restartCount++;
                    console.log(`🔄 Auto-restarting inference server (${this.restartCount}/${this.maxRestarts})...`);
                    setTimeout(() => this.start(), 2000);
                } else {
                    console.error('❌ Max restart attempts reached. ML predictions disabled.');
                }
            });
            
            // Wait for ready signal
            await this.waitForReady(10000);
            
        } catch (error: any) {
            console.error(`❌ Failed to start inference server: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Stop the Python inference process
     */
    stop(): void {
        if (this.pythonProcess) {
            console.log('🛑 Stopping ML inference server...');
            this.pythonProcess.kill('SIGTERM');
            this.pythonProcess = null;
            this.isReady = false;
        }
    }
    
    /**
     * Get prediction for a token
     */
    async predict(token: TokenData): Promise<PredictionResult> {
        if (!this.isReady || !this.pythonProcess) {
            throw new Error('Inference server not ready');
        }
        
        // Build features
        const features = await this.featureBuilder.buildFeatures(token);
        
        if (!features) {
            return {
                profitable: 0.0,
                max_profit: 0.0,
                rug_risk: 1.0,
                confidence: 0.0,
                error: 'Failed to build features'
            };
        }
        
        // Send to Python and wait for response
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            
            // Timeout after 5 seconds
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error('Inference timeout'));
            }, 5000);
            
            this.pendingRequests.set(id, { resolve, reject, timeout });
            
            // Send request
            const request = JSON.stringify(features) + '\n';
            this.pythonProcess!.stdin?.write(request);
        });
    }
    
    /**
     * Handle stdout data from Python
     */
    private handleStdout(data: string): void {
        this.buffer += data;
        
        // Process complete lines
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);
            
            if (line) {
                try {
                    const result: PredictionResult = JSON.parse(line);
                    
                    // Resolve the oldest pending request (FIFO)
                    const firstRequest = this.pendingRequests.values().next().value;
                    if (firstRequest) {
                        const id = Array.from(this.pendingRequests.keys())[0];
                        clearTimeout(firstRequest.timeout);
                        firstRequest.resolve(result);
                        this.pendingRequests.delete(id);
                    }
                } catch (error: any) {
                    console.error(`❌ Failed to parse prediction: ${error.message}`);
                }
            }
        }
    }
    
    /**
     * Wait for inference server to be ready
     */
    private async waitForReady(timeoutMs: number): Promise<void> {
        const startTime = Date.now();
        
        while (!this.isReady) {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error('Inference server startup timeout');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    /**
     * Check if inference server is healthy
     */
    isHealthy(): boolean {
        return this.isReady && this.pythonProcess !== null && !this.pythonProcess.killed;
    }
}

// Singleton instance
let instance: InferenceClient | null = null;

export function getInferenceClient(): InferenceClient {
    if (!instance) {
        instance = new InferenceClient();
    }
    return instance;
}

export async function startInferenceServer(): Promise<void> {
    const client = getInferenceClient();
    await client.start();
}

export function stopInferenceServer(): void {
    if (instance) {
        instance.stop();
        instance = null;
    }
}
