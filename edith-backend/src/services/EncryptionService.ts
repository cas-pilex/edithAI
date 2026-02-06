import {
  encrypt,
  decrypt,
  encryptToken,
  decryptToken,
  encryptPII,
  decryptPII,
  generateSecureToken,
} from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

export interface EncryptedTokens {
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken?: string;
}

class EncryptionService {
  /**
   * Encrypt OAuth tokens for storage
   */
  async encryptOAuthTokens(
    accessToken: string,
    refreshToken?: string
  ): Promise<EncryptedTokens> {
    try {
      const accessTokenEncrypted = await encryptToken(accessToken);
      const refreshTokenEncrypted = refreshToken
        ? await encryptToken(refreshToken)
        : undefined;

      return {
        accessTokenEncrypted,
        refreshTokenEncrypted,
      };
    } catch (error) {
      logger.error('Failed to encrypt OAuth tokens', { error });
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Decrypt OAuth tokens for use
   */
  async decryptOAuthTokens(
    accessTokenEncrypted: string,
    refreshTokenEncrypted?: string
  ): Promise<DecryptedTokens> {
    try {
      const accessToken = await decryptToken(accessTokenEncrypted);
      const refreshToken = refreshTokenEncrypted
        ? await decryptToken(refreshTokenEncrypted)
        : undefined;

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error('Failed to decrypt OAuth tokens', { error });
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Encrypt sensitive PII data
   */
  async encryptSensitiveData(data: string): Promise<string> {
    try {
      return await encryptPII(data);
    } catch (error) {
      logger.error('Failed to encrypt PII data', { error });
      throw new Error('PII encryption failed');
    }
  }

  /**
   * Decrypt sensitive PII data
   */
  async decryptSensitiveData(encryptedData: string): Promise<string> {
    try {
      return await decryptPII(encryptedData);
    } catch (error) {
      logger.error('Failed to decrypt PII data', { error });
      throw new Error('PII decryption failed');
    }
  }

  /**
   * Encrypt generic data
   */
  async encryptData(data: string): Promise<string> {
    try {
      return await encrypt(data);
    } catch (error) {
      logger.error('Failed to encrypt data', { error });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt generic data
   */
  async decryptData(encryptedData: string): Promise<string> {
    try {
      return await decrypt(encryptedData);
    } catch (error) {
      logger.error('Failed to decrypt data', { error });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt a JSON object
   */
  async encryptJSON<T>(data: T): Promise<string> {
    try {
      const jsonString = JSON.stringify(data);
      return await encrypt(jsonString);
    } catch (error) {
      logger.error('Failed to encrypt JSON data', { error });
      throw new Error('JSON encryption failed');
    }
  }

  /**
   * Decrypt a JSON object
   */
  async decryptJSON<T>(encryptedData: string): Promise<T> {
    try {
      const jsonString = await decrypt(encryptedData);
      return JSON.parse(jsonString) as T;
    } catch (error) {
      logger.error('Failed to decrypt JSON data', { error });
      throw new Error('JSON decryption failed');
    }
  }

  /**
   * Generate a secure random token
   */
  generateToken(length: number = 32): string {
    return generateSecureToken(length);
  }

  /**
   * Re-encrypt data with a new key (for key rotation)
   * Note: This is a placeholder - actual key rotation would need
   * more infrastructure for managing old/new keys
   */
  async reEncrypt(
    encryptedData: string,
    _oldKeyType: 'default' | 'tokens' | 'pii',
    _newKeyType: 'default' | 'tokens' | 'pii'
  ): Promise<string> {
    // In a real implementation, you would:
    // 1. Decrypt with old key
    // 2. Encrypt with new key
    // 3. Handle the key type transition
    // For now, we just return the data unchanged
    // as we don't have a full key rotation infrastructure
    logger.warn('Key rotation called but not fully implemented');
    return encryptedData;
  }
}

export const encryptionService = new EncryptionService();
export default encryptionService;
