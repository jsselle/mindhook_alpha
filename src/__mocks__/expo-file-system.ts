export const documentDirectory = 'file:///mock/documents/';

export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
export const readAsStringAsync = jest.fn().mockResolvedValue('');
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const getInfoAsync = jest.fn().mockResolvedValue({ exists: true, size: 1024 });
export const copyAsync = jest.fn().mockResolvedValue(undefined);

export const EncodingType = {
    UTF8: 'utf8',
    Base64: 'base64',
};
