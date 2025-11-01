import { createHash } from 'crypto';
import dotenv from 'dotenv';

class SecureConfig {
  private static instance: SecureConfig;
  private encryptedValues: Map<string, string> = new Map();
  private originalValues: Map<string, string> = new Map();
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): SecureConfig {
    if (!SecureConfig.instance) {
      SecureConfig.instance = new SecureConfig();
    }
    return SecureConfig.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load environment variables
    const result = dotenv.config();
    if (result.error) {
      console.error('Error loading .env file:', result.error);
      throw new Error('Failed to load environment variables');
    }

    console.log('Initializing secure config...');

    // First, take any values provided in process.env and store them
    const sensitiveKeys = [
      'WALLET_PRIVATE_KEY',
      'HUGGINGFACE_TOKEN',
      'TWITTER_BEARER_TOKEN'
    ];

    sensitiveKeys.forEach(key => {
      const value = process.env[key];
      // Treat obvious placeholders as missing
      const isPlaceholder = typeof value === 'string' && /REDACTED/i.test(value);
      if (value && !isPlaceholder) {
        this.encryptedValues.set(key, this.encrypt(value));
        this.originalValues.set(key, value);
      }
      // Always remove from process.env to avoid leaking
      if (process.env[key] !== undefined) delete process.env[key];
    });

    // If keytar is available and we don't have the wallet key yet, try OS credential store
    try {
      // Dynamically require so projects without keytar installed won't fail
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const keytar = require('keytar');
      // Prefer OS credential store if available
      const stored = await keytar.getPassword('snipebt', 'wallet');
      if (stored) {
        const hadEnv = this.originalValues.has('WALLET_PRIVATE_KEY');
        this.encryptedValues.set('WALLET_PRIVATE_KEY', this.encrypt(stored));
        this.originalValues.set('WALLET_PRIVATE_KEY', stored);
        console.log(hadEnv
          ? 'Overriding WALLET_PRIVATE_KEY from OS credential store'
          : 'Loaded WALLET_PRIVATE_KEY from OS credential store');
      }
    } catch (err) {
      // keytar not installed or not available — that's okay, continue without it
      // We'll just rely on .env values
    }

    this.initialized = true;
    console.log('Secure config initialized successfully');
  }

  private encrypt(value: string): string {
    return createHash('sha256')
      .update(value)
      .digest('hex');
  }

  public getValue(key: string): string {
    if (!this.initialized) {
      throw new Error('SecureConfig not initialized');
    }

    // For sensitive values, return original value
    if (this.originalValues.has(key)) {
      return this.originalValues.get(key)!;
    }
    return process.env[key] || '';
  }

  public validateValue(key: string, value: string): boolean {
    if (!this.initialized) {
      throw new Error('SecureConfig not initialized');
    }

    const storedHash = this.encryptedValues.get(key);
    if (!storedHash) return false;
    return storedHash === this.encrypt(value);
  }

  // Get sensitive value safely
  public getSensitiveValue(key: string, context: string): string {
    if (!this.initialized) {
      throw new Error('SecureConfig not initialized');
    }

    if (!this.originalValues.has(key)) {
      throw new Error(`No sensitive value found for key: ${key}`);
    }

    console.log(`Accessing sensitive value ${key} from ${context}`);
    return this.originalValues.get(key)!;
  }

  // Method to verify a command's permission to access sensitive data
  public async verifyCommandPermission(command: string, _requiredKeys?: string[]): Promise<boolean> {
    // Add your command verification logic here
    // For example, whitelist certain commands or check digital signatures
    const allowedCommands = ['trade', 'validate', 'monitor'];
    return allowedCommands.includes(command);
  }

  // Add memory protection
  public enableMemoryProtection(): void {
    if (process.platform === 'win32') {
      // Windows-specific memory protection
      process.on('uncaughtException', () => {
        this.clearSensitiveData();
      });
    }
    
    // Clean up on exit
    process.on('SIGINT', () => {
      this.clearSensitiveData();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      this.clearSensitiveData();
      process.exit(0);
    });
  }

  private clearSensitiveData(): void {
    this.encryptedValues.clear();
    this.initialized = false;
  }
}

export const secureConfig = SecureConfig.getInstance();