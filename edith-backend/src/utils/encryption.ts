import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { config } from '../config/index.js';

const scryptAsync = promisify(scrypt);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

type KeyType = 'default' | 'tokens' | 'pii';

function getKey(keyType: KeyType): string {
  switch (keyType) {
    case 'tokens':
      return config.encryption.tokenKey;
    case 'pii':
      return config.encryption.piiKey;
    default:
      return config.encryption.key;
  }
}

/**
 * Encrypt a string using AES-256-GCM
 * Format: salt:iv:authTag:encrypted (all hex encoded)
 */
export async function encrypt(plaintext: string, keyType: KeyType = 'default'): Promise<string> {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string');
  }

  const masterKey = getKey(keyType);
  const salt = randomBytes(SALT_LENGTH);
  const key = (await scryptAsync(masterKey, salt, 32)) as Buffer;
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted,
  ].join(':');
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 */
export async function decrypt(encryptedData: string, keyType: KeyType = 'default'): Promise<string> {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty string');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltHex, ivHex, authTagHex, encrypted] = parts;

  const masterKey = getKey(keyType);
  const salt = Buffer.from(saltHex, 'hex');
  const key = (await scryptAsync(masterKey, salt, 32)) as Buffer;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt OAuth tokens
 */
export async function encryptToken(token: string): Promise<string> {
  return encrypt(token, 'tokens');
}

/**
 * Decrypt OAuth tokens
 */
export async function decryptToken(encryptedToken: string): Promise<string> {
  return decrypt(encryptedToken, 'tokens');
}

/**
 * Encrypt PII data (Personal Identifiable Information)
 */
export async function encryptPII(data: string): Promise<string> {
  return encrypt(data, 'pii');
}

/**
 * Decrypt PII data
 */
export async function decryptPII(encryptedData: string): Promise<string> {
  return decrypt(encryptedData, 'pii');
}

/**
 * Hash a value for comparison (one-way, not reversible)
 */
export async function hashValue(value: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = (await scryptAsync(value, salt, 64)) as Buffer;
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a hashed value
 */
export async function verifyHash(value: string, hashedValue: string): Promise<boolean> {
  const [saltHex, originalHash] = hashedValue.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = (await scryptAsync(value, salt, 64)) as Buffer;
  return hash.toString('hex') === originalHash;
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a secure random code (numeric)
 */
export function generateSecureCode(length: number = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += (bytes[i] % 10).toString();
  }
  return code;
}
