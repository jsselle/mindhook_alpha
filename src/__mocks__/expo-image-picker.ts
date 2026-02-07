export const MediaTypeOptions = {
    Images: 'images',
    Videos: 'videos',
    All: 'all',
};

export const requestMediaLibraryPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });
export const requestCameraPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });

export const launchImageLibraryAsync = jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{
        uri: 'file:///mock/photo.jpg',
        width: 1024,
        height: 768,
        mimeType: 'image/jpeg',
    }],
});

export const launchCameraAsync = jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{
        uri: 'file:///mock/camera.jpg',
        width: 1920,
        height: 1080,
        mimeType: 'image/jpeg',
    }],
});
