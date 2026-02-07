// Mock expo-crypto for testing without native modules
export const randomUUID = jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000000');

export const digestStringAsync = jest.fn().mockResolvedValue('mock-hash-digest');

export const CryptoDigestAlgorithm = {
    MD5: 'MD5',
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
};
