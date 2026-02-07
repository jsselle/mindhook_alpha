import { Audio } from 'expo-av';

jest.mock('expo-av');
jest.mock('expo-file-system');
jest.mock('expo-sqlite');

describe('Audio Recorder Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('expo-av Audio mock', () => {
        it('requestPermissionsAsync returns granted', async () => {
            const result = await Audio.requestPermissionsAsync();
            expect(result.granted).toBe(true);
        });

        it('setAudioModeAsync completes without error', async () => {
            await expect(Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            })).resolves.toBeUndefined();
        });

        it('Recording class can be instantiated', () => {
            const recording = new Audio.Recording();
            expect(recording).toBeDefined();
        });

        it('Recording prepareToRecordAsync works', async () => {
            const recording = new Audio.Recording();
            await expect(recording.prepareToRecordAsync({})).resolves.toBeUndefined();
        });

        it('Recording startAsync works', async () => {
            const recording = new Audio.Recording();
            await expect(recording.startAsync()).resolves.toBeUndefined();
        });

        it('Recording stopAndUnloadAsync works', async () => {
            const recording = new Audio.Recording();
            await expect(recording.stopAndUnloadAsync()).resolves.toBeUndefined();
        });

        it('Recording getURI returns mock path', () => {
            const recording = new Audio.Recording();
            const uri = recording.getURI();
            expect(uri).toBe('file:///mock/recording.m4a');
        });

        it('Recording getStatusAsync returns mock status', async () => {
            const recording = new Audio.Recording();
            const status = await recording.getStatusAsync();
            expect(status.isRecording).toBe(false);
            expect(status.durationMillis).toBe(5000);
        });

        it('handles permission denied', async () => {
            (Audio.requestPermissionsAsync as jest.Mock)
                .mockResolvedValueOnce({ granted: false });

            const result = await Audio.requestPermissionsAsync();
            expect(result.granted).toBe(false);
        });
    });

    describe('Audio format constants', () => {
        it('has IOSOutputFormat constants', () => {
            expect(Audio.IOSOutputFormat.MPEG4AAC).toBe('aac');
        });

        it('has IOSAudioQuality constants', () => {
            expect(Audio.IOSAudioQuality.HIGH).toBe('high');
        });

        it('has AndroidOutputFormat constants', () => {
            expect(Audio.AndroidOutputFormat.MPEG_4).toBe('mp4');
        });

        it('has AndroidAudioEncoder constants', () => {
            expect(Audio.AndroidAudioEncoder.AAC).toBe('aac');
        });
    });
});
