import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Dimensions, Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

interface ImageThumbnailProps {
    localPath: string;
    width?: number;
    height?: number;
}

export const ImageThumbnail: React.FC<ImageThumbnailProps> = ({
    localPath,
    width = 200,
    height = 150,
}) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;

    return (
        <>
            <TouchableOpacity onPress={() => setIsFullscreen(true)}>
                <Image
                    source={{ uri: localPath }}
                    style={[styles.thumbnail, { width, height }]}
                    resizeMode="cover"
                />
            </TouchableOpacity>

            <Modal
                visible={isFullscreen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsFullscreen(false)}
            >
                <View style={styles.modalContainer}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setIsFullscreen(false)}
                    >
                        <Ionicons name="close" size={32} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Image
                        source={{ uri: localPath }}
                        style={{ width: screenWidth, height: screenHeight * 0.8 }}
                        resizeMode="contain"
                    />
                </View>
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
