import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';
import { getThumbnailDimensions } from './imageThumbnailSizing';

interface ImageThumbnailProps {
    localPath: string;
    width?: number;
    height?: number;
}

const DEFAULT_THUMBNAIL_WIDTH = 200;
const DEFAULT_THUMBNAIL_HEIGHT = 150;

export const ImageThumbnail: React.FC<ImageThumbnailProps> = ({
    localPath,
    width = DEFAULT_THUMBNAIL_WIDTH,
    height = DEFAULT_THUMBNAIL_HEIGHT,
}) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const thumbnail = getThumbnailDimensions(width, height);

    return (
        <>
            <TouchableOpacity onPress={() => setIsFullscreen(true)}>
                <Image
                    source={{ uri: localPath }}
                    style={[styles.thumbnail, { width: thumbnail.width, height: thumbnail.height }]}
                    resizeMode="cover"
                />
            </TouchableOpacity>

            <Modal
                visible={isFullscreen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsFullscreen(false)}
            >
                <Pressable style={styles.modalContainer} onPress={() => setIsFullscreen(false)}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setIsFullscreen(false)}
                    >
                        <Ionicons name="close" size={32} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Image
                        source={{ uri: localPath }}
                        style={{ width: screenWidth, height: screenHeight }}
                        resizeMode="contain"
                    />
                </Pressable>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    thumbnail: {
        borderRadius: radii.md,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.overlay.scrim,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        padding: spacing.sm,
    },
});
