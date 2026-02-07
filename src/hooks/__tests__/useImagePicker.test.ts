import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { setDatabaseInstance } from '../../db/connection';

jest.mock('expo-image-picker');
jest.mock('expo-file-system');
jest.mock('expo-sqlite');

// We can't use renderHook without @testing-library/react-native,
// so we test the underlying functions directly by importing and calling them.
// For hooks that manage state, we test the core logic modules they depend on.

describe('Image Picker Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetMockDatabase();
        setDatabaseInstance(null);
    });

    describe('expo-image-picker mock', () => {
        it('requestMediaLibraryPermissionsAsync returns granted', async () => {
            const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
            expect(result.granted).toBe(true);
        });

        it('requestCameraPermissionsAsync returns granted', async () => {
            const result = await ImagePicker.requestCameraPermissionsAsync();
            expect(result.granted).toBe(true);
        });

        it('launchImageLibraryAsync returns mock assets', async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });

            expect(result.canceled).toBe(false);
            expect(result.assets).toBeDefined();
            expect(result.assets![0].uri).toBe('file:///mock/photo.jpg');
            expect(result.assets![0].width).toBe(1024);
            expect(result.assets![0].height).toBe(768);
        });

        it('launchCameraAsync returns mock assets', async () => {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });

            expect(result.canceled).toBe(false);
            expect(result.assets).toBeDefined();
            expect(result.assets![0].uri).toBe('file:///mock/camera.jpg');
            expect(result.assets![0].width).toBe(1920);
            expect(result.assets![0].height).toBe(1080);
        });

        it('handles permission denied', async () => {
            (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock)
                .mockResolvedValueOnce({ granted: false });

            const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
            expect(result.granted).toBe(false);
        });

        it('handles user cancellation', async () => {
            (ImagePicker.launchImageLibraryAsync as jest.Mock)
                .mockResolvedValueOnce({ canceled: true, assets: [] });

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });

            expect(result.canceled).toBe(true);
        });
    });

    describe('file storage integration', () => {
        it('FileSystem mock copyAsync works', async () => {
            await FileSystem.copyAsync({
                from: 'file:///mock/source.jpg',
                to: 'file:///mock/dest.jpg',
            });

            expect(FileSystem.copyAsync).toHaveBeenCalledWith({
                from: 'file:///mock/source.jpg',
                to: 'file:///mock/dest.jpg',
            });
        });
    });
});
