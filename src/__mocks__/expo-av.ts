const mockSound = {
    playAsync: jest.fn().mockResolvedValue(undefined),
    pauseAsync: jest.fn().mockResolvedValue(undefined),
    stopAsync: jest.fn().mockResolvedValue(undefined),
    unloadAsync: jest.fn().mockResolvedValue(undefined),
    setPositionAsync: jest.fn().mockResolvedValue(undefined),
    getStatusAsync: jest.fn().mockResolvedValue({
        isLoaded: true,
        isPlaying: false,
        positionMillis: 0,
        durationMillis: 5000,
    }),
};

export const Audio = {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Recording: jest.fn().mockImplementation(() => ({
        prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
        startAsync: jest.fn().mockResolvedValue(undefined),
        stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
        getURI: jest.fn().mockReturnValue('file:///mock/recording.m4a'),
        getStatusAsync: jest.fn().mockResolvedValue({ isRecording: false, durationMillis: 5000 }),
    })),
    Sound: {
        createAsync: jest.fn().mockResolvedValue({ sound: mockSound }),
    },
    IOSOutputFormat: { MPEG4AAC: 'aac' },
    IOSAudioQuality: { HIGH: 'high' },
    AndroidOutputFormat: { MPEG_4: 'mp4' },
    AndroidAudioEncoder: { AAC: 'aac' },
};
